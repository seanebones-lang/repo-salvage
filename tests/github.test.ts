import { afterEach, describe, expect, it, vi } from "vitest";
import { lastHumanCommit, snapshotRepo, resolveSourceCommit, isPublicRepo, type GhRepo } from "@/lib/github";

const repo = { full_name: "me/x", default_branch: "main" } as GhRepo;
const sha = "a".repeat(40);
const commit = (date: string, message: string, login = "me", type = "User") => ({
  commit: { author: { date }, message },
  author: { login, type },
});
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

afterEach(() => vi.unstubAllGlobals());

describe("lastHumanCommit", () => {
  it("skips bots and dependency noise", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      json([
        commit("2024-05-01T00:00:00Z", "Bump lodash", "dependabot[bot]", "Bot"),
        commit("2024-04-01T00:00:00Z", "chore(deps): update x"),
        commit("2023-02-03T00:00:00Z", "Fix login bug"),
      ])));
    expect(await lastHumanCommit("t", repo)).toBe("2023-02-03T00:00:00Z");
  });

  it("keeps an 'Initial commit' as a human commit", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json([commit("2020-01-01T00:00:00Z", "Initial commit")])));
    expect(await lastHumanCommit("t", repo)).toBe("2020-01-01T00:00:00Z");
  });

  it("returns null for empty repos (409) instead of throwing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ message: "Git Repository is empty." }, 409)));
    expect(await lastHumanCommit("t", repo)).toBeNull();
  });

  it("returns null when every commit is a bot", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json([commit("2024-01-01T00:00:00Z", "x", "renovate[bot]", "Bot")])));
    expect(await lastHumanCommit("t", repo)).toBeNull();
  });
});

describe("snapshotRepo", () => {
  it("excludes vendored/binary/lock files and fetches README, manifests and source", async () => {
    const tree = [
      { path: "README.md", type: "blob", size: 300 },
      { path: "package.json", type: "blob", size: 300 },
      { path: "src/auth.ts", type: "blob", size: 2000 },
      { path: "node_modules/x/index.js", type: "blob", size: 5000 },
      { path: "logo.png", type: "blob", size: 5000 },
      { path: "package-lock.json", type: "blob", size: 5000 },
    ];
    const fetched: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("/git/trees/")) return json({ tree });
      fetched.push(url);
      return new Response("content");
    }));
    const snap = await snapshotRepo("t", repo, sha);
    expect(snap.tree).toEqual(["README.md", "package.json", "src/auth.ts"]);
    expect(snap.files.map((f) => f.path).sort()).toEqual(["README.md", "package.json", "src/auth.ts"]);
    expect(fetched.some((u) => u.includes("node_modules"))).toBe(false);
  });

  it("gives a clear error for unreadable (empty) repos", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({}, 409)));
    await expect(snapshotRepo("t", repo, sha)).rejects.toThrow(/empty/);
  });
});

describe("immutable snapshots and visibility", () => {
  it("retains all known paths and sampled paths beyond a 300-file prompt", async () => {
    const tree = Array.from({ length: 350 }, (_, i) => ({ path: `src/f${i}.ts`, type: "blob", size: i === 349 ? 9000 : 300 }));
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      urls.push(url);
      expect(init.headers ?? {}).not.toHaveProperty("Authorization");
      return url.includes("/git/trees/") ? json({ tree }) : new Response("source");
    }));
    const snap = await snapshotRepo("secret", repo, sha);
    expect(snap.knownPaths).toHaveLength(350);
    expect(snap.tree).toHaveLength(300);
    expect(snap.tree).toContain("src/f349.ts");
    expect(snap.files.some((f) => f.path === "src/f349.ts")).toBe(true);
    expect(urls.every((u) => u.includes(sha))).toBe(true);
  });

  it("rejects truncated trees, missing samples and failed reads", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ tree: [], truncated: true })));
    await expect(snapshotRepo("t", repo, sha)).rejects.toThrow(/incomplete/);
    vi.stubGlobal("fetch", vi.fn(async () => json({ tree: [] })));
    await expect(snapshotRepo("t", repo, sha)).rejects.toThrow(/No readable/);
    vi.stubGlobal("fetch", vi.fn(async (url: string) => url.includes("/git/trees/") ? json({ tree: [{ path: "README.md", type: "blob" }] }) : json({}, 404)));
    await expect(snapshotRepo("t", repo, sha)).rejects.toThrow(/sampled file/);
  });

  it("resolves the branch once and pins commit history", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      urls.push(url);
      return url.endsWith("/commits/main") ? json({ sha }) : json([]);
    }));
    expect(await resolveSourceCommit("t", repo)).toBe(sha);
    await lastHumanCommit("t", repo, sha);
    expect(urls[1]).toContain(`sha=${sha}`);
  });

  it("hides private, deleted, transferred and unavailable repositories anonymously", async () => {
    for (const body of [{ id: 1, private: true, owner: { id: 42 } }, { id: 1, private: false, owner: { id: 99 } }]) {
      vi.stubGlobal("fetch", vi.fn(async () => json(body)));
      expect(await isPublicRepo(1, 42)).toBe(false);
    }
    vi.stubGlobal("fetch", vi.fn(async () => json({}, 404)));
    expect(await isPublicRepo(1, 42)).toBe(false);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    expect(await isPublicRepo(1, 42)).toBe(false);
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      expect(init.headers ?? {}).not.toHaveProperty("Authorization");
      return json({ id: 1, private: false, owner: { id: 42 } });
    }));
    expect(await isPublicRepo(1, 42)).toBe(true);
  });
});
