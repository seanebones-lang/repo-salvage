import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { indexedSnapshotRepo, type GhRepo } from "@/lib/github";

const repo = { full_name: "author/repo" } as GhRepo;
const commit = "a".repeat(40);
const blob = (text: string) =>
  createHash("sha1")
    .update(`blob ${Buffer.byteLength(text)}\0`)
    .update(text)
    .digest("hex");
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
function transport(
  files: {
    path: string;
    content: string;
    mode?: string;
    size?: number;
    sha?: string;
  }[],
) {
  const fetch = vi.fn(async (url: string, init: RequestInit) => {
    expect(init.headers ?? {}).not.toHaveProperty("Authorization");
    expect(url).toContain(commit);
    if (url.includes("/git/trees/"))
      return new Response(
        JSON.stringify({
          tree: files.map((f) => ({
            path: f.path,
            mode: f.mode ?? "100644",
            type: "blob",
            size: f.size ?? Buffer.byteLength(f.content),
            sha: f.sha ?? blob(f.content),
          })),
        }),
      );
    const file = files.find((f) =>
      url.endsWith(f.path.split("/").map(encodeURIComponent).join("/")),
    )!;
    return new Response(file.content);
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
describe("indexed pinned snapshots", () => {
  it("reads complete large and tiny files, verifies blobs and records unsupported symlinks/generated assets", async () => {
    const fetch = transport([
      {
        path: "tiny.ts",
        content: "export const twice = (n: number) => n * 2;",
      },
      {
        path: "large.ts",
        content:
          "/*" +
          "x".repeat(25_000) +
          "*/\nexport function tail() { return 1; }",
      },
      { path: "link.ts", content: "tiny.ts", mode: "120000" },
      { path: "public/asset.js", content: "export const asset = 1;" },
    ]);
    const snap = await indexedSnapshotRepo("never-forward-this", repo, commit);
    expect(snap.index?.targets.map((t) => t.symbol)).toEqual(["tail", "twice"]);
    expect(snap.index?.skipped).toContainEqual({
      path: "link.ts",
      reason: "unsupported_path_or_mode",
    });
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(snap.files.every((f) => !f.truncated)).toBe(true);
  });
  it("rejects tampered pinned bytes rather than accepting a source path as proof", async () => {
    transport([
      {
        path: "x.ts",
        content: "export const x = 2;",
        sha: blob("export const x = 1;"),
      },
    ]);
    await expect(indexedSnapshotRepo("t", repo, commit)).rejects.toThrow(
      /Git blob/,
    );
  });
  it("records explicit inventory omissions and withholds targets for dishonest oversize bodies", async () => {
    transport([
      { path: "huge.ts", content: "", size: 200_000 },
      {
        path: "dishonest.ts",
        content: "/*" + "x".repeat(129_000) + "*/ export const x = 1;",
        size: 100,
      },
      ...Array.from({ length: 66 }, (_, i) => ({
        path: `dir${i}/small.ts`,
        content: "export const x = 1;",
      })),
    ]);
    const snap = await indexedSnapshotRepo("t", repo, commit);
    expect(snap.files).toHaveLength(64);
    expect(snap.index?.skipped).toContainEqual({
      path: "huge.ts",
      reason: "file_byte_limit",
    });
    expect(
      snap.index?.skipped.some((s) => s.reason === "file_count_limit"),
    ).toBe(true);
    const dishonest = snap.index?.files.find((f) => f.path === "dishonest.ts");
    if (dishonest) expect(dishonest.coverage).toBe("prefix");
    expect(snap.index?.targets.some((t) => t.path === "dishonest.ts")).toBe(
      false,
    );
  });
  it("allows exactly-limit complete bodies and refuses incomplete source trees", async () => {
    const suffix = "*/export const x = 1;";
    const content =
      "/*" + "x".repeat(128_000 - 2 - Buffer.byteLength(suffix)) + suffix;
    expect(Buffer.byteLength(content)).toBe(128_000);
    transport([{ path: "boundary.ts", content }]);
    const snap = await indexedSnapshotRepo("t", repo, commit);
    expect(snap.files[0].truncated).toBe(false);
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () => new Response(JSON.stringify({ truncated: true, tree: [] })),
      ),
    );
    await expect(indexedSnapshotRepo("t", repo, commit)).rejects.toThrow(
      /incomplete/,
    );
  });
});
