import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  getSession: vi.fn(),
  enqueueAnalysis: vi.fn(),
  jobForKey: vi.fn(),
  cancelJob: vi.fn(),
  getOwnedPublicRepo: vi.fn(),
  resolveSourceCommit: vi.fn(),
  indexedSnapshotRepo: vi.fn(),
  lastHumanCommit: vi.fn(),
  isPublicRepoFresh: vi.fn(),
  summarizeRepo: vi.fn(),
  beginAnalysis: vi.fn(),
  analysisBaseline: vi.fn(),
  analysisIsActive: vi.fn(),
  finishAnalysis: vi.fn(),
  releaseAnalysis: vi.fn(),
  getListing: vi.fn(),
  deleteListing: vi.fn(),
  reviewComponent: vi.fn(),
}));
vi.mock("@/auth", () => ({ getSession: m.getSession }));
vi.mock("@/lib/github", () => m);
vi.mock("@/lib/summarize", () => ({ summarizeRepo: m.summarizeRepo }));
vi.mock("@/lib/db", () => m);
vi.mock("@/lib/analysis-jobs", async (original) => ({
  ...(await original<typeof import("@/lib/analysis-jobs")>()),
  enqueueAnalysis: m.enqueueAnalysis,
  jobForKey: m.jobForKey,
  cancelJob: m.cancelJob,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import {
  salvage,
  unlist,
  setComponentReview,
  cancelAnalysis,
} from "@/app/dashboard/actions";
const sha = "a".repeat(40);
const repo = {
  id: 1,
  full_name: "me/util",
  owner: { id: 42, login: "me" },
  license: { spdx_id: "MIT", name: "MIT License" },
};
const snap = {};
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("ANTHROPIC_API_KEY", "test-only");
  vi.stubEnv("ANALYSIS_WORKER_ENABLED", "1");
  m.enqueueAnalysis.mockReturnValue({ id: "job" });
  m.getSession.mockResolvedValue({
    ghId: 42,
    login: "me",
    accessToken: "token",
  });
  m.getOwnedPublicRepo.mockResolvedValue(repo);
  m.resolveSourceCommit.mockResolvedValue(sha);
  m.indexedSnapshotRepo.mockResolvedValue(snap);
  m.lastHumanCommit.mockResolvedValue(null);
  m.isPublicRepoFresh.mockResolvedValue(true);
  m.analysisIsActive.mockReturnValue(true);
  m.beginAnalysis.mockReturnValue("analysis-token");
  m.finishAnalysis.mockReturnValue(true);
  m.summarizeRepo.mockResolvedValue({
    summary: { overview: "x", reusable_pieces: [] },
    model: "returned-model",
  });
});
const form = () => {
  const f = new FormData();
  f.set("repoId", "1");
  f.set("requestKey", "request-key-fixture-001");
  return f;
};
describe("publication orchestration", () => {
  it("queues one pinned commit without sampling or provider work in the request", async () => {
    expect(await salvage(null, form())).toHaveProperty("jobId", "job");
    expect(m.resolveSourceCommit).toHaveBeenCalledTimes(1);
    expect(m.enqueueAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: 42,
        repoId: 1,
        sourceSha: sha,
        repoName: "me/util",
        key: "request-key-fixture-001",
      }),
    );
    expect(m.indexedSnapshotRepo).not.toHaveBeenCalled();
    expect(m.summarizeRepo).not.toHaveBeenCalled();
    expect(m.finishAnalysis).not.toHaveBeenCalled();
  });
  it("replays an existing enqueue after configuration changes without GitHub requests", async () => {
    const { payloadHash } = await import("@/lib/analysis-jobs");
    m.jobForKey.mockReturnValue({
      id: "prior",
      payload_hash: payloadHash(1, null, null),
    });
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect(await salvage(null, form())).toHaveProperty("jobId", "prior");
    expect(m.getOwnedPublicRepo).not.toHaveBeenCalled();
    expect(m.enqueueAnalysis).not.toHaveBeenCalled();
  });
  it("rejects changed context under the same nonce", async () => {
    m.jobForKey.mockReturnValue({ id: "prior", payload_hash: "other" });
    expect(await salvage(null, form())).toHaveProperty("error");
    expect(m.getOwnedPublicRepo).not.toHaveBeenCalled();
  });
  it("removes stored listings without requiring GitHub inventory", async () => {
    m.getListing.mockReturnValue({ owner_id: 42 });
    const f = new FormData();
    f.set("id", "7");
    await unlist(f);
    expect(m.deleteListing).toHaveBeenCalledWith(7, 42);
    expect(m.getOwnedPublicRepo).not.toHaveBeenCalled();
  });
  it.each([null, { spdx_id: "NOASSERTION" }])(
    "rejects unlicensed or unidentified licensing before reserving quota",
    async (license) => {
      m.getOwnedPublicRepo.mockResolvedValue({ ...repo, license });
      expect(await salvage(null, form())).toHaveProperty("error");
      expect(m.beginAnalysis).not.toHaveBeenCalled();
      expect(m.summarizeRepo).not.toHaveBeenCalled();
    },
  );
  it.each([{ id: 2 }, { owner: { id: 99, login: "me" } }])(
    "rejects mismatched repository identity before reserving quota: %j",
    async (change) => {
      m.getOwnedPublicRepo.mockResolvedValue({ ...repo, ...change });
      expect(await salvage(null, form())).toHaveProperty("error");
      expect(m.enqueueAnalysis).not.toHaveBeenCalled();
    },
  );
  it("rejects invalid identifiers before spending an API request", async () => {
    const f = form();
    f.set("repoId", "NaN");
    expect(await salvage(null, f)).toHaveProperty("error");
    expect(m.getOwnedPublicRepo).not.toHaveBeenCalled();
  });
});

describe("owner review authorization", () => {
  const reviewForm = () => {
    const f = new FormData();
    for (const [key, value] of Object.entries({
      listingId: "7",
      partId: "part",
      sourceSha: sha,
      analyzedAt: "now",
      reviewed: "true",
    }))
      f.set(key, value);
    return f;
  };
  it("rejects another owner's listing before recording a review", async () => {
    m.getListing.mockReturnValue({ owner_id: 99 });
    expect(await setComponentReview(null, reviewForm())).toHaveProperty(
      "error",
    );
    expect(m.reviewComponent).not.toHaveBeenCalled();
  });
  it("requires current public ownership and exact analysis before recording", async () => {
    m.getListing.mockReturnValue({ owner_id: 42, github_repo_id: 1 });
    m.reviewComponent.mockReturnValue(true);
    expect(await setComponentReview(null, reviewForm())).toHaveProperty("ok");
    expect(m.reviewComponent).toHaveBeenCalledWith(
      7,
      42,
      "part",
      sha,
      "now",
      true,
    );
    m.reviewComponent.mockClear();
    m.isPublicRepoFresh.mockResolvedValue(false);
    expect(await setComponentReview(null, reviewForm())).toHaveProperty(
      "error",
    );
    expect(m.reviewComponent).not.toHaveBeenCalled();
  });
});

it("reports queue reservation failure without source reads or provider work", async () => {
  m.enqueueAnalysis.mockImplementation(() => {
    throw Error("Already running");
  });
  expect(await salvage(null, form())).toEqual({ error: "Already running" });
  expect(m.indexedSnapshotRepo).not.toHaveBeenCalled();
  expect(m.summarizeRepo).not.toHaveBeenCalled();
});
it.each(["ANTHROPIC_API_KEY", "ANALYSIS_WORKER_ENABLED"])(
  "stops a new unconfigured analysis before GitHub calls: %s",
  async (key) => {
    vi.stubEnv(key, "");
    expect(await salvage(null, form())).toHaveProperty("error");
    expect(m.getOwnedPublicRepo).not.toHaveBeenCalled();
    expect(m.enqueueAnalysis).not.toHaveBeenCalled();
  },
);
it("scopes cancellation to the signed-in owner", async () => {
  const data = new FormData();
  data.set("jobId", "job");
  await cancelAnalysis(data);
  expect(m.cancelJob).toHaveBeenCalledWith("job", 42);
  m.cancelJob.mockClear();
  m.getSession.mockResolvedValue(null);
  await cancelAnalysis(data);
  expect(m.cancelJob).not.toHaveBeenCalled();
});
it("rejects a missing nonce before GitHub calls", async () => {
  const data = form();
  data.delete("requestKey");
  expect(await salvage(null, data)).toHaveProperty("error");
  expect(m.getOwnedPublicRepo).not.toHaveBeenCalled();
});
