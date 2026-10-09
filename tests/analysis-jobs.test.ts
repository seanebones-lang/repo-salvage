import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { indexSources, evidencePacket } from "@/lib/source-index";
import type { GhRepo, RepoSnapshot } from "@/lib/github";
import type { AnalysisResponse } from "@/lib/analysis-provider";
const m = vi.hoisted(() => ({
  fresh: vi.fn(),
  snapshot: vi.fn(),
  last: vi.fn(),
  session: vi.fn(),
}));
vi.mock("@/lib/github", () => ({
  getPublicOwnedRepoFresh: m.fresh,
  indexedSnapshotRepo: m.snapshot,
  lastHumanCommit: m.last,
}));
vi.mock("@/auth", () => ({ getSession: m.session }));
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "salvage-jobs-"));
let d: typeof import("@/lib/db");
let j: typeof import("@/lib/analysis-jobs");
let w: typeof import("@/lib/analysis-worker");
let route: typeof import("@/app/api/analysis-jobs/[id]/route");
const sha = "a".repeat(40);
const repo = {
  id: 7,
  full_name: "author/parser",
  name: "parser",
  owner: { id: 42, login: "author" },
  html_url: "https://github.com/author/parser",
  description: null,
  language: "TypeScript",
  stargazers_count: 0,
  forks_count: 0,
  license: { spdx_id: "MIT" },
  private: false,
  fork: false,
  default_branch: "main",
} as GhRepo;
const snapshot = (): RepoSnapshot => {
  const files = [
    {
      path: "src/parser.ts",
      content: "export function parse(text: string) { return text.trim(); }",
    },
  ];
  const index = indexSources(files, ["src/parser.ts"]);
  return {
    sourceSha: sha,
    files,
    tree: ["src/parser.ts"],
    knownPaths: ["src/parser.ts"],
    index,
    packet: evidencePacket(index),
  };
};
const response = (): AnalysisResponse => {
  const target = snapshot().packet!.targets[0];
  return {
    text: JSON.stringify({
      overview: "A parser",
      outcome: "candidates",
      reusable_pieces: [
        {
          target_id: target.id,
          name: "Row parser",
          description: "Trims text",
          category: "Data processing",
          integration_notes: "Inspect the declaration and test trimming.",
          limitations: [],
          explanation_refs: [target.reference_id],
        },
      ],
    }),
    model: "fixture-returned-model",
    requestId: "fixture-receipt",
    usage: { input_tokens: 100, output_tokens: 20 },
    stopReason: "end_turn",
  };
};
const enqueue = (over: Partial<Parameters<typeof j.enqueueAnalysis>[0]> = {}) =>
  j.enqueueAnalysis({
    ownerId: 42,
    repoId: 7,
    repoName: repo.full_name,
    sourceSha: sha,
    note: "owner context",
    draftId: null,
    key: randomUUID(),
    model: "pinned-fixture-model",
    baseline: d.analysisBaseline(over.repoId ?? 7),
    ...over,
  });
const expireLease = () =>
  d.db().prepare("UPDATE analysis_jobs SET lease_expires_at=0").run();
const checkpoint = (job: import("@/lib/analysis-jobs").AnalysisJob) =>
  j.saveJobField(
    job,
    "checkpoint_json",
    { repo, snap: snapshot(), last: null },
    "inspecting",
  );
beforeAll(async () => {
  vi.stubEnv("DATABASE_PATH", path.join(directory, "jobs.db"));
  vi.stubEnv("DAILY_SUMMARY_LIMIT", "100");
  vi.stubEnv("GLOBAL_DAILY_SUMMARY_LIMIT", "100");
  d = await import("@/lib/db");
  j = await import("@/lib/analysis-jobs");
  w = await import("@/lib/analysis-worker");
  route = await import("@/app/api/analysis-jobs/[id]/route");
});
beforeEach(() => {
  vi.resetAllMocks();
  for (const table of [
    "analysis_jobs",
    "active_analyses",
    "summary_runs",
    "listings",
    "analysis_revisions",
  ])
    d.db().prepare(`DELETE FROM ${table}`).run();
  m.fresh.mockResolvedValue(repo);
  m.snapshot.mockImplementation(async () => snapshot());
  m.last.mockResolvedValue(null);
  m.session.mockResolvedValue({
    ghId: 42,
    accessToken: "private-oauth-secret",
  });
});
afterAll(() => {
  d.db().close();
  fs.rmSync(directory, { recursive: true, force: true });
  vi.unstubAllEnvs();
});
describe("durable queue and fencing with real SQLite", () => {
  it("replays the same nonce and active context without reserving a second allowance", () => {
    const first = enqueue();
    expect(enqueue({ key: first.request_key }).id).toBe(first.id);
    expect(enqueue().id).toBe(first.id);
    expect(() => enqueue({ key: first.request_key, note: "changed" })).toThrow(
      /different/,
    );
    expect(() => enqueue({ note: "changed" })).toThrow(/already/);
    expect(d.db().prepare("SELECT * FROM summary_runs").all()).toHaveLength(1);
  });
  it("bounds pending work per owner and rolls back a rejected enqueue", () => {
    enqueue();
    enqueue({ repoId: 8 });
    expect(() => enqueue({ repoId: 9 })).toThrow(/queue is full/);
    expect(d.db().prepare("SELECT * FROM summary_runs").all()).toHaveLength(2);
    expect(d.db().prepare("SELECT * FROM active_analyses").all()).toHaveLength(
      2,
    );
  });
  it("leases only one job across workers and fences a stale worker after recovery", () => {
    enqueue();
    enqueue({ repoId: 8 });
    const original = j.claimNextJob()!;
    expect(j.claimNextJob()).toBeNull();
    expireLease();
    const replacement = j.claimNextJob()!;
    expect(replacement.id).toBe(original.id);
    expect(replacement.lease_token).not.toBe(original.lease_token);
    expect(j.renewJob(original)).toBe(false);
    expect(() => checkpoint(original)).toThrow(/lease/);
    expect(j.finishJob(original, "failed", "old", "old")).toBe(false);
    expect(j.jobById(original.id, 42)?.status).toBe("inspecting");
    expect(replacement.inspection_attempts).toBe(2);
  });
  it("stops after three interrupted inspections without consuming new allowances", () => {
    const job = enqueue();
    for (let n = 0; n < 3; n++) {
      expect(j.claimNextJob()).not.toBeNull();
      expireLease();
    }
    expect(j.claimNextJob()).toBeNull();
    expect(j.jobById(job.id, 42)).toMatchObject({
      status: "failed",
      error_code: "inspection_interrupted",
    });
    expect(d.db().prepare("SELECT * FROM summary_runs").all()).toHaveLength(1);
    expect(d.db().prepare("SELECT * FROM active_analyses").all()).toEqual([]);
  });
  it("keeps an interrupted provider request paused and never automatically retries it", async () => {
    const job = enqueue(),
      lease = j.claimNextJob()!;
    checkpoint(lease);
    expect(j.markProviderStarted(lease, { input: "fixture" })).toBe(true);
    expireLease();
    const generate = vi.fn(async () => response());
    expect(await w.runNextJob({ generate })).toBeNull();
    expect(generate).not.toHaveBeenCalled();
    expect(j.jobById(job.id, 42)).toMatchObject({
      status: "needs_attention",
      error_code: "provider_outcome_unknown",
      checkpoint_json: null,
      response_json: null,
      result_json: null,
    });
    expect(enqueue({ key: job.request_key }).id).toBe(job.id);
    expect(j.claimNextJob()).toBeNull();
    const deliberate = enqueue();
    expect(deliberate.id).not.toBe(job.id);
    expect(d.db().prepare("SELECT * FROM summary_runs").all()).toHaveLength(2);
  });
  it("recovers stored source without another inspection and pins the originally selected model", async () => {
    const job = enqueue(),
      lease = j.claimNextJob()!;
    checkpoint(lease);
    expireLease();
    const generate = vi.fn(async () => response());
    expect(await w.runNextJob({ generate })).toMatchObject({
      id: job.id,
      status: "succeeded",
      inspection_attempts: 1,
    });
    expect(m.snapshot).not.toHaveBeenCalled();
    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({ model: "pinned-fixture-model" }),
    );
    expect(JSON.stringify(generate.mock.calls)).not.toContain(
      "private-oauth-secret",
    );
    expect(d.allListings()[0]).toMatchObject({
      source_sha: sha,
      summary_model: "fixture-returned-model",
    });
  });
  it("revalidates a saved response after restart without requesting another generation", async () => {
    const job = enqueue(),
      lease = j.claimNextJob()!;
    checkpoint(lease);
    j.markProviderStarted(lease, {});
    j.saveJobField(lease, "response_json", response(), "generating");
    expireLease();
    const generate = vi.fn(async () => response());
    expect(await w.runNextJob({ generate })).toMatchObject({
      id: job.id,
      status: "succeeded",
      checkpoint_json: null,
      response_json: null,
      result_json: null,
    });
    expect(generate).not.toHaveBeenCalled();
    expect(m.snapshot).not.toHaveBeenCalled();
    expect(d.analysisHistory(d.allListings()[0].id, 42)).toHaveLength(1);
  });
  it("rejects invalid stored output without a provider retry or catalog mutation", async () => {
    const job = enqueue(),
      lease = j.claimNextJob()!;
    checkpoint(lease);
    j.markProviderStarted(lease, {});
    j.saveJobField(
      lease,
      "response_json",
      { ...response(), text: "{}" },
      "generating",
    );
    expireLease();
    const generate = vi.fn(async () => response());
    expect(await w.runNextJob({ generate })).toMatchObject({
      id: job.id,
      status: "failed",
      error_code: "invalid_response",
    });
    expect(generate).not.toHaveBeenCalled();
    expect(d.allListings()).toEqual([]);
  });
  it("resumes a saved validated result without interpretation, then publishes only once", async () => {
    const job = enqueue(),
      lease = j.claimNextJob()!;
    checkpoint(lease);
    const { verifiedIndexedSummary } = await import("@/lib/summarize");
    const snap = snapshot();
    j.saveJobField(
      lease,
      "result_json",
      {
        github_repo_id: 7,
        owner_id: 42,
        owner_login: "author",
        name: repo.name,
        full_name: repo.full_name,
        url: repo.html_url,
        description: null,
        language: "TypeScript",
        stars: 0,
        forks: 0,
        license: "MIT",
        last_human_commit: null,
        owner_note: job.note,
        summary: verifiedIndexedSummary(
          response().text,
          snap.index!,
          snap.packet!,
        ),
        source_sha: sha,
        analyzed_at: "2026-10-09T00:00:00Z",
        summary_model: "saved-model",
      },
      "publishing",
    );
    expireLease();
    const generate = vi.fn(async () => response());
    expect(await w.runNextJob({ generate })).toMatchObject({
      status: "succeeded",
    });
    expect(await w.runNextJob({ generate })).toBeNull();
    expect(generate).not.toHaveBeenCalled();
    expect(m.snapshot).not.toHaveBeenCalled();
    expect(d.allListings()).toHaveLength(1);
  });
  it("retains an uncertain billing outcome when the entire job lifetime expires", () => {
    const job = enqueue(),
      lease = j.claimNextJob()!;
    checkpoint(lease);
    j.markProviderStarted(lease, {});
    d.db().prepare("UPDATE analysis_jobs SET deadline=0").run();
    d.db().prepare("UPDATE active_analyses SET expires_at=0").run();
    j.recoverJobs();
    expect(j.jobById(job.id, 42)).toMatchObject({
      status: "needs_attention",
      error_code: "provider_outcome_unknown",
    });
  });
  it("cancels a queued job only for its owner and prevents stale publication", async () => {
    const job = enqueue();
    j.cancelJob(job.id, 99);
    expect(j.jobById(job.id, 42)?.status).toBe("queued");
    const lease = j.claimNextJob()!;
    checkpoint(lease);
    j.cancelJob(job.id, 42);
    const generate = vi.fn(async () => response());
    await w.executeJob(lease, { generate });
    expect(generate).not.toHaveBeenCalled();
    expect(d.allListings()).toEqual([]);
    expect(j.jobById(job.id, 42)?.checkpoint_json).toBeNull();
  });
  it("expires queued jobs and prunes terminal details after seven days", () => {
    const job = enqueue();
    d.db().prepare("UPDATE analysis_jobs SET deadline=0").run();
    j.recoverJobs();
    expect(j.jobById(job.id, 42)?.status).toBe("failed");
    d.db().prepare("UPDATE analysis_jobs SET updated_at=0").run();
    j.recoverJobs();
    expect(j.jobById(job.id, 42)).toBeNull();
  });
  it("refuses oversized checkpoints before any provider request", () => {
    enqueue();
    const lease = j.claimNextJob()!;
    expect(() =>
      j.saveJobField(
        lease,
        "checkpoint_json",
        { text: "x".repeat(2_000_000) },
        "inspecting",
      ),
    ).toThrow(/storage allowance/);
    expect(j.jobById(lease.id, 42)?.provider_started_at).toBeNull();
  });
});
describe("worker boundaries", () => {
  it("preserves an uncertain charge when the job expires before its response can be saved", async () => {
    enqueue();
    expect(
      await w.runNextJob({
        generate: async () => {
          d.db().prepare("UPDATE analysis_jobs SET deadline=0").run();
          d.db().prepare("UPDATE active_analyses SET expires_at=0").run();
          return response();
        },
      }),
    ).toMatchObject({
      status: "needs_attention",
      error_code: "provider_outcome_unknown",
    });
    expect(d.allListings()).toEqual([]);
  });
  it.each(["before_source", "before_provider", "before_publication"])(
    "checks public ownership %s",
    async (when) => {
      const job = enqueue(),
        generate = vi.fn(async () => response());
      const passes =
        when === "before_source" ? 0 : when === "before_provider" ? 1 : 2;
      m.fresh.mockReset();
      for (let n = 0; n < passes; n++) m.fresh.mockResolvedValueOnce(repo);
      m.fresh.mockRejectedValue(Error("Not public"));
      expect(await w.runNextJob({ generate })).toMatchObject({
        id: job.id,
        status: "failed",
        error_code: "verification_failed",
      });
      expect(generate).toHaveBeenCalledTimes(
        when === "before_publication" ? 1 : 0,
      );
      expect(d.allListings()).toEqual([]);
    },
  );
  it("classifies a timeout as uncertain and a known HTTP rejection as failed, with no retries", async () => {
    const first = enqueue(),
      generate = vi.fn(async () => {
        throw Error("Timeout");
      });
    expect(await w.runNextJob({ generate })).toMatchObject({
      id: first.id,
      status: "needs_attention",
    });
    expect(generate).toHaveBeenCalledTimes(1);
    const second = enqueue();
    const rejected = vi.fn(async () => {
      throw Object.assign(Error("Rejected"), { status: 401 });
    });
    expect(await w.runNextJob({ generate: rejected })).toMatchObject({
      id: second.id,
      status: "failed",
      error_code: "provider_rejected",
    });
    expect(rejected).toHaveBeenCalledTimes(1);
  });
  it("treats a provider HTTP timeout as uncertain rather than a known rejection", async () => {
    enqueue();
    expect(
      await w.runNextJob({
        generate: async () => {
          throw Object.assign(Error("Timeout"), { status: 408 });
        },
      }),
    ).toMatchObject({ status: "needs_attention" });
  });
  it("prevents a late provider response from publishing after owner cancellation", async () => {
    const job = enqueue();
    const generate = vi.fn(async () => {
      j.cancelJob(job.id, 42);
      return response();
    });
    expect(await w.runNextJob({ generate })).toMatchObject({
      id: job.id,
      status: "canceled",
      response_json: null,
    });
    expect(d.allListings()).toEqual([]);
  });
  it("uses the current repository name when publishing a pinned source version", async () => {
    enqueue();
    m.fresh
      .mockResolvedValueOnce(repo)
      .mockResolvedValueOnce(repo)
      .mockResolvedValueOnce({
        ...repo,
        name: "renamed",
        full_name: "author/renamed",
        html_url: "https://github.com/author/renamed",
      });
    await w.runNextJob({ generate: async () => response() });
    expect(d.allListings()[0]).toMatchObject({
      full_name: "author/renamed",
      source_sha: sha,
    });
  });
});
describe("private progress API", () => {
  const get = (id: string) =>
    route.GET(new Request("http://localhost"), {
      params: Promise.resolve({ id }),
    });
  it("requires a session, hides foreign jobs and returns only owner progress fields", async () => {
    const job = enqueue(),
      lease = j.claimNextJob()!;
    checkpoint(lease);
    const result = await get(job.id);
    expect(result.status).toBe(200);
    expect(result.headers.get("cache-control")).toBe("private, no-store");
    const value = await result.json();
    expect(value).toMatchObject({ id: job.id, source_sha: sha });
    for (const key of [
      "owner_id",
      "analysis_token",
      "lease_token",
      "checkpoint_json",
      "response_json",
      "result_json",
      "note",
      "request_key",
      "payload_hash",
    ])
      expect(value).not.toHaveProperty(key);
    m.session.mockResolvedValue({ ghId: 99 });
    expect((await get(job.id)).status).toBe(404);
    m.session.mockResolvedValue(null);
    expect((await get(job.id)).status).toBe(401);
  });
});
