import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  getSession: vi.fn(),
  getOwnedPublicRepo: vi.fn(),
  resolveSourceCommit: vi.fn(),
  snapshotRepo: vi.fn(),
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
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { salvage, unlist, setComponentReview } from "@/app/dashboard/actions";
const sha = "a".repeat(40);
const repo = {
  id: 1,
  owner: { id: 42, login: "me" },
  license: { spdx_id: "MIT", name: "MIT License" },
};
const snap = {
  sourceSha: sha,
  knownPaths: ["x.ts"],
  tree: ["x.ts"],
  files: [{ path: "x.ts", content: "source" }],
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("ANTHROPIC_API_KEY", "test-only");
  m.getSession.mockResolvedValue({
    ghId: 42,
    login: "me",
    accessToken: "token",
  });
  m.getOwnedPublicRepo.mockResolvedValue(repo);
  m.resolveSourceCommit.mockResolvedValue(sha);
  m.snapshotRepo.mockResolvedValue(snap);
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
  return f;
};
describe("publication orchestration", () => {
  it("uses one resolved commit for sampling, history and saved provenance", async () => {
    expect(await salvage(null, form())).toHaveProperty("ok");
    expect(m.resolveSourceCommit).toHaveBeenCalledTimes(1);
    expect(m.snapshotRepo).toHaveBeenCalledWith("token", repo, sha);
    expect(m.lastHumanCommit).toHaveBeenCalledWith("token", repo, sha);
    expect(m.summarizeRepo).toHaveBeenCalledWith(repo, snap, null);
    expect(m.finishAnalysis).toHaveBeenCalledWith(
      "analysis-token",
      expect.objectContaining({
        owner_id: 42,
        source_sha: sha,
        summary_model: "returned-model",
        analyzed_at: expect.any(String),
      }),
    );
  });
  it("does not invoke the model when the public sample fails", async () => {
    m.snapshotRepo.mockRejectedValue(new Error("Unreadable sample"));
    expect(await salvage(null, form())).toEqual({ error: "Unreadable sample" });
    expect(m.summarizeRepo).not.toHaveBeenCalled();
    expect(m.finishAnalysis).not.toHaveBeenCalled();
  });
  it.each(["before", "after"])(
    "stops publication when visibility changes %s the model call",
    async (when) => {
      if (when === "before") m.isPublicRepoFresh.mockResolvedValue(false);
      else
        m.isPublicRepoFresh
          .mockResolvedValueOnce(true)
          .mockResolvedValueOnce(false);
      expect(await salvage(null, form())).toHaveProperty("error");
      expect(m.finishAnalysis).not.toHaveBeenCalled();
      if (when === "before") expect(m.summarizeRepo).not.toHaveBeenCalled();
    },
  );
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

describe("analysis lifecycle", () => {
  it("does not report success for a canceled publication", async () => {
    m.finishAnalysis.mockReturnValue(false);
    expect(await salvage(null, form())).toEqual({
      error:
        "This analysis was canceled or expired. It has not been published.",
    });
    expect(m.releaseAnalysis).toHaveBeenCalledWith("analysis-token");
  });
  it("releases its reservation after provider failure so a later attempt can run", async () => {
    m.summarizeRepo.mockRejectedValue(new Error("Provider timed out"));
    expect(await salvage(null, form())).toEqual({
      error: "Provider timed out",
    });
    expect(m.releaseAnalysis).toHaveBeenCalledWith("analysis-token");
    expect(m.finishAnalysis).not.toHaveBeenCalled();
  });
  it("rejects overlapping analyses before fetching source or invoking the provider", async () => {
    m.beginAnalysis.mockImplementation(() => {
      throw new Error("Already running");
    });
    expect(await salvage(null, form())).toEqual({ error: "Already running" });
    expect(m.snapshotRepo).not.toHaveBeenCalled();
    expect(m.summarizeRepo).not.toHaveBeenCalled();
    expect(m.releaseAnalysis).not.toHaveBeenCalled();
  });
});

it("stops an unconfigured analysis before GitHub calls or quota consumption", async () => {
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  expect(await salvage(null, form())).toHaveProperty("error");
  expect(m.getOwnedPublicRepo).not.toHaveBeenCalled();
  expect(m.beginAnalysis).not.toHaveBeenCalled();
});

it("avoids the provider request when removal has canceled the analysis during source sampling", async () => {
  m.analysisIsActive.mockReturnValue(false);
  expect(await salvage(null, form())).toHaveProperty("error");
  expect(m.summarizeRepo).not.toHaveBeenCalled();
  expect(m.finishAnalysis).not.toHaveBeenCalled();
  expect(m.releaseAnalysis).toHaveBeenCalledWith("analysis-token");
});
