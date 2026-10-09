import { randomUUID } from "node:crypto";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Ajv from "ajv/dist/2020";
import { exampleListing } from "@/lib/examples";
const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  status: vi.fn(),
  tree: vi.fn(),
  fresh: vi.fn(),
  owned: vi.fn(),
  resolve: vi.fn(),
  snapshot: vi.fn(),
  last: vi.fn(),
  summarize: vi.fn(),
}));
vi.mock("@/auth", () => ({ getSession: mocks.session }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/github", () => ({
  publicRepoStatus: mocks.status,
  pinnedSourceTree: mocks.tree,
  isPublicRepoFresh: mocks.fresh,
  getOwnedPublicRepo: mocks.owned,
  getPublicOwnedRepoFresh: mocks.owned,
  resolveSourceCommit: mocks.resolve,
  indexedSnapshotRepo: mocks.snapshot,
  lastHumanCommit: mocks.last,
}));
vi.mock("@/lib/summarize", () => ({ summarizeRepo: mocks.summarize }));
let c: typeof import("@/lib/contributions");
let d: typeof import("@/lib/db");
let route: typeof import("@/app/api/v1/drafts/route");
let actions: typeof import("@/app/dashboard/actions");
let issuer: typeof import("@/app/dashboard/agents/actions");
async function completeAnalysis(data: FormData) {
  data.set("requestKey", randomUUID());
  const queued = await actions.salvage(null, data);
  if (!queued?.jobId) return queued;
  const { runNextJob } = await import("@/lib/analysis-worker");
  const { jobById } = await import("@/lib/analysis-jobs");
  await runNextJob();
  const job = jobById(queued.jobId, 42);
  return job?.status === "succeeded"
    ? { ok: "Analysis completed" }
    : { error: job?.error_message ?? "Canceled" };
}
const sha = "a".repeat(40);
const repo = {
  id: 1,
  full_name: "me/util",
  name: "util",
  description: null,
  language: "TypeScript",
  stargazers_count: 0,
  forks_count: 0,
  html_url: "https://github.com/me/util",
  owner: { id: 42, login: "me" },
  private: false,
  fork: false,
  license: { spdx_id: "MIT" },
};
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "salvage-drafts-"));
beforeAll(async () => {
  vi.stubEnv("DATABASE_PATH", path.join(directory, "test.db"));
  vi.stubEnv("DAILY_SUMMARY_LIMIT", "100");
  vi.stubEnv("GLOBAL_DAILY_SUMMARY_LIMIT", "100");
  vi.stubEnv("ANALYSIS_WORKER_ENABLED", "1");
  vi.stubEnv("ANTHROPIC_API_KEY", "test-placeholder");
  d = await import("@/lib/db");
  c = await import("@/lib/contributions");
  route = await import("@/app/api/v1/drafts/route");
  actions = await import("@/app/dashboard/actions");
  issuer = await import("@/app/dashboard/agents/actions");
  c.credentialsForOwner(42);
});
afterAll(() => {
  d.db().close();
  fs.rmSync(directory, { recursive: true, force: true });
  vi.unstubAllEnvs();
});
beforeEach(() => {
  vi.resetAllMocks();
  for (const table of [
    "analysis_jobs",
    "agent_drafts",
    "agent_credentials",
    "listings",
    "summary_runs",
    "active_analyses",
    "request_limits",
  ])
    d.db().prepare(`DELETE FROM ${table}`).run();
  mocks.session.mockResolvedValue({
    ghId: 42,
    login: "me",
    accessToken: "github-test",
  });
  mocks.status.mockResolvedValue({ status: "public", repo });
  mocks.tree.mockResolvedValue([]);
  mocks.fresh.mockResolvedValue(true);
  mocks.owned.mockResolvedValue(repo);
  mocks.resolve.mockResolvedValue(sha);
  mocks.snapshot.mockResolvedValue({
    sourceSha: sha,
    knownPaths: [],
    tree: [],
    files: [],
  });
  mocks.last.mockResolvedValue(null);
  mocks.summarize.mockResolvedValue({
    summary: exampleListing.summary,
    model: "mock-model",
  });
});
const issue = () => c.issueCredential(42, "Coding agent", [1], 1);
const request = (
  token: string,
  body: unknown = { repo_id: 1, source_sha: sha, note: "Reuse the parser" },
  key = "proposal-001",
) =>
  new Request("http://localhost/api/v1/drafts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Idempotency-Key": key,
    },
    body: JSON.stringify(body),
  });
async function proposal() {
  const issued = issue();
  const response = await route.POST(request(issued.token));
  expect(response.status).toBe(201);
  return { ...issued, draft: await response.json() };
}
const reviewForm = (id: string) => {
  const f = new FormData();
  f.set("repoId", "1");
  f.set("draftId", id);
  f.set("note", "Owner-edited context");
  return f;
};
describe("scoped draft credentials", () => {
  it("stores only a hash, bounds scope/expiry and gives no public token metadata", () => {
    const item = issue();
    const row = d
      .db()
      .prepare("SELECT * FROM agent_credentials")
      .get() as Record<string, unknown>;
    expect(JSON.stringify(row)).not.toContain(item.token);
    expect(row.token_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(item.credential.expires_at - item.credential.created_at).toBe(
      3_600_000,
    );
    expect(c.credentialsForOwner(999)).toEqual([]);
    expect(() => c.issueCredential(42, "x", [1], 169)).toThrow();
    expect(() => c.issueCredential(42, "x", [], 1)).toThrow();
  });
  it("does not let forged issuer form IDs or owner identity create credentials", async () => {
    const form = new FormData();
    form.set("name", "x");
    form.set("hours", "1");
    form.set("repoId", "1");
    mocks.owned.mockResolvedValue({
      ...repo,
      owner: { id: 999, login: "other" },
    });
    expect(await issuer.issue(null, form)).toHaveProperty("error");
    expect(c.credentialsForOwner(42)).toEqual([]);
    mocks.session.mockResolvedValue(null);
    expect(await issuer.issue(null, form)).toEqual({ error: "Sign in first." });
  });
  it("bounds issuer verification before further GitHub calls", async () => {
    const form = new FormData();
    form.set("name", "Agent");
    form.set("hours", "1");
    form.set("repoId", "1");
    for (let i = 0; i < 10; i++)
      expect(await issuer.issue(null, form)).toHaveProperty("token");
    expect(await issuer.issue(null, form)).toHaveProperty("error");
    expect(mocks.owned).toHaveBeenCalledTimes(10);
  });
  it("bounds active credentials and shows all active ones before history", () => {
    for (let i = 0; i < 10; i++) issue();
    expect(() => issue()).toThrow(/Revoke/);
    expect(c.credentialsForOwner(42)).toHaveLength(10);
  });
  it.each(["missing", "expired", "revoked"])(
    "rejects %s credentials",
    async (mode) => {
      const item = issue();
      if (mode === "expired")
        d.db().prepare("UPDATE agent_credentials SET expires_at = 0").run();
      if (mode === "revoked") c.revokeCredential(item.credential.id, 42);
      const res = await route.POST(
        request(mode === "missing" ? "no" : item.token),
      );
      expect(res.status).toBe(401);
      expect(mocks.status).not.toHaveBeenCalled();
    },
  );
  it("denies repository scope before GitHub and shares rate allowance across credentials", async () => {
    const item = issue();
    expect(
      (
        await route.POST(
          request(item.token, { repo_id: 2, source_sha: sha, note: "x" }),
        )
      ).status,
    ).toBe(403);
    expect(mocks.status).not.toHaveBeenCalled();
    const other = issue();
    for (let n = 1; n < 30; n++)
      expect(
        (
          await route.GET(
            new Request("http://localhost/api/v1/drafts", {
              headers: { Authorization: `Bearer ${item.token}` },
            }),
          )
        ).status,
      ).toBe(200);
    const limited = await route.GET(
      new Request("http://localhost/api/v1/drafts", {
        headers: { Authorization: `Bearer ${other.token}` },
      }),
    );
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("60");
  });
});
describe("private proposals", () => {
  it("records verified source, exposes no internal token and charges no analysis", async () => {
    const { draft } = await proposal();
    expect(draft.source_sha).toBe(sha);
    expect(draft.owner_review_required).toBe(true);
    expect(draft.analysis_charged_on_creation).toBe(false);
    expect(draft).not.toHaveProperty("analysis_token");
    expect(draft).not.toHaveProperty("credential_id");
    expect(d.allListings()).toEqual([]);
    expect(d.db().prepare("SELECT * FROM summary_runs").all()).toEqual([]);
    expect(mocks.summarize).not.toHaveBeenCalled();
    const contract = JSON.parse(fs.readFileSync("public/openapi.json", "utf8"));
    const check = new Ajv({ strict: false }).compile(
      contract.components.schemas.Draft,
    );
    expect(check(draft), JSON.stringify(check.errors)).toBe(true);
  });
  it("serializes concurrent identical proposals into one stored draft", async () => {
    const item = issue();
    const results = await Promise.all([
      route.POST(request(item.token)),
      route.POST(request(item.token)),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 201]);
    expect(c.draftsForOwner(42)).toHaveLength(1);
  });
  it("caps new and unfinished drafts across credentials", () => {
    const item = issue();
    for (let i = 0; i < 50; i++)
      c.createDraft(
        item.credential,
        `proposal-${i}`,
        c.proposalHash(1, sha, `Context ${i}`),
        {
          repo_id: 1,
          full_name: repo.full_name,
          source_sha: sha,
          note: `Context ${i}`,
        },
      );
    const other = issue();
    expect(() =>
      c.createDraft(other.credential, "another-key", "digest", {
        repo_id: 1,
        full_name: repo.full_name,
        source_sha: sha,
        note: "x",
      }),
    ).toThrow(/allowance/);
    for (const draft of c.draftsForOwner(42)) c.dismissDraft(draft.id, 42);
    expect(() =>
      c.createDraft(other.credential, "another-key", "digest", {
        repo_id: 1,
        full_name: repo.full_name,
        source_sha: sha,
        note: "x",
      }),
    ).toThrow(/allowance/);
  });
  it("replays exact proposals without repeating upstream work, but conflicts on reuse", async () => {
    const { token, draft } = await proposal();
    expect((await route.POST(request(token))).status).toBe(200);
    expect(mocks.tree).toHaveBeenCalledTimes(1);
    expect(
      (
        await route.POST(
          request(token, { repo_id: 1, source_sha: sha, note: "different" }),
        )
      ).status,
    ).toBe(409);
    expect(c.draftsForOwner(42)).toHaveLength(1);
    expect(c.draftsForOwner(42)[0].id).toBe(draft.id);
  });
  it.each(["private", "owner", "fork", "license", "outage"])(
    "rejects %s repository verification",
    async (mode) => {
      mocks.status.mockResolvedValue(
        mode === "outage"
          ? { status: "unavailable" }
          : ["private", "owner"].includes(mode)
            ? { status: "excluded" }
            : {
                status: "public",
                repo: {
                  ...repo,
                  ...(mode === "fork" ? { fork: true } : { license: null }),
                },
              },
      );
      expect((await route.POST(request(issue().token))).status).toBe(
        mode === "outage" ? 503 : 409,
      );
      expect(c.draftsForOwner(42)).toEqual([]);
    },
  );
  it("rechecks revocation and public ownership after asynchronous source verification", async () => {
    const item = issue();
    mocks.tree.mockImplementation(async () => {
      c.revokeCredential(item.credential.id, 42);
      return [];
    });
    expect((await route.POST(request(item.token))).status).toBe(401);
    expect(c.draftsForOwner(42)).toEqual([]);
    mocks.tree.mockResolvedValue([]);
    mocks.fresh.mockResolvedValue(false);
    expect((await route.POST(request(issue().token))).status).toBe(409);
  });
  it("bounds JSON, rejects generated summaries, malformed commits and unsafe keys", async () => {
    const { token } = issue();
    for (const body of [
      { repo_id: 1, source_sha: sha, note: "x", summary: {} },
      { repo_id: 1, source_sha: "main", note: "x" },
      { repo_id: 1, source_sha: sha, note: "x".repeat(3000) },
    ])
      expect((await route.POST(request(token, body))).status).toBe(400);
    expect((await route.POST(request(token, undefined, "bad"))).status).toBe(
      400,
    );
    expect(mocks.tree).not.toHaveBeenCalled();
  });
  it("reads only this credential's drafts and requires authentication", async () => {
    const { token } = await proposal();
    const other = issue();
    const get = (value: string) =>
      route.GET(
        new Request("http://localhost/api/v1/drafts", {
          headers: { Authorization: `Bearer ${value}` },
        }),
      );
    expect((await (await get(token)).json()).drafts).toHaveLength(1);
    expect((await (await get(other.token)).json()).drafts).toEqual([]);
    expect((await get("bad")).status).toBe(401);
    expect(c.draftsForOwner(999)).toEqual([]);
  });
});
describe("owner-controlled paid publication", () => {
  it("requires owner approval, uses owner-edited context, and consumes a draft once", async () => {
    const { draft } = await proposal();
    expect(await completeAnalysis(reviewForm(draft.id))).toHaveProperty("ok");
    expect(mocks.summarize).toHaveBeenCalledWith(
      repo,
      expect.objectContaining({ sourceSha: sha }),
      "Owner-edited context",
      expect.any(Object),
    );
    expect(c.draftById(draft.id, 42)?.status).toBe("published");
    expect(d.allListings()).toHaveLength(1);
    expect(await completeAnalysis(reviewForm(draft.id))).toHaveProperty(
      "error",
    );
    expect(mocks.summarize).toHaveBeenCalledTimes(1);
    expect(d.db().prepare("SELECT * FROM summary_runs").all()).toHaveLength(1);
  });
  it("rejects moved commits and foreign drafts before charging", async () => {
    const { draft } = await proposal();
    mocks.resolve.mockResolvedValue("b".repeat(40));
    expect(await completeAnalysis(reviewForm(draft.id))).toHaveProperty(
      "error",
    );
    expect(mocks.summarize).not.toHaveBeenCalled();
    expect(d.db().prepare("SELECT * FROM summary_runs").all()).toEqual([]);
    mocks.session.mockResolvedValue({
      ghId: 999,
      login: "other",
      accessToken: "x",
    });
    expect(await completeAnalysis(reviewForm(draft.id))).toHaveProperty(
      "error",
    );
  });
  it.each(["revocation", "dismissal", "expiry", "unlisting"])(
    "cancels late model publication after %s",
    async (mode) => {
      const { credential, draft } = await proposal();
      if (mode === "unlisting")
        d.upsertListing({ ...exampleListing, github_repo_id: 1, owner_id: 42 });
      mocks.summarize.mockImplementation(async () => {
        if (mode === "revocation") c.revokeCredential(credential.id, 42);
        if (mode === "dismissal") c.dismissDraft(draft.id, 42);
        if (mode === "expiry")
          d.db().prepare("UPDATE agent_credentials SET expires_at = 0").run();
        if (mode === "unlisting") d.deleteListing(d.allListings()[0].id, 42);
        return { summary: exampleListing.summary, model: "mock" };
      });
      expect(await completeAnalysis(reviewForm(draft.id))).toHaveProperty(
        "error",
      );
      expect(d.allListings()).toEqual([]);
      expect(c.draftById(draft.id, 42)?.status).toBe("dismissed");
      expect(d.db().prepare("SELECT * FROM active_analyses").all()).toEqual([]);
    },
  );
  it("resets a failed analysis for deliberate retry and recovers a crashed reservation", async () => {
    const { draft } = await proposal();
    mocks.summarize.mockRejectedValue(new Error("provider test failure"));
    expect(await completeAnalysis(reviewForm(draft.id))).toHaveProperty(
      "error",
    );
    expect(c.draftById(draft.id, 42)?.status).toBe("pending");
    c.claimDraft(draft.id, 42, 1, sha, null);
    d.db().prepare("UPDATE active_analyses SET expires_at = 0").run();
    expect(c.draftsForOwner(42)[0].status).toBe("pending");
  });
  it("does not allow hidden listings to be refreshed through drafts", async () => {
    const { draft } = await proposal();
    d.upsertListing({ ...exampleListing, github_repo_id: 1, owner_id: 42 });
    d.db().prepare("UPDATE listings SET moderation_hidden_at = 'hidden'").run();
    expect(await completeAnalysis(reviewForm(draft.id))).toHaveProperty(
      "error",
    );
    expect(mocks.summarize).not.toHaveBeenCalled();
  });
});
