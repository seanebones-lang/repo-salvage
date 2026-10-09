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
  it("uses reserved reads for omitted dependencies and import-linked tests before filling the remaining inventory allowance", async () => {
    transport([
      {
        path: "aaa.ts",
        content:
          'import { helper } from "./zz-helper"; export const useful = helper;',
      },
      ...Array.from({ length: 70 }, (_, i) => ({
        path: `filler-${String(i).padStart(2, "0")}.ts`,
        content: "export const filler = 1;",
      })),
      {
        path: "zz-helper.ts",
        content:
          'import { value } from "./zz-value"; export const helper = value;',
      },
      { path: "zz-value.ts", content: "export const value = 2;" },
      {
        path: "tests/aaa.test.ts",
        content: 'import { useful } from "../aaa"; useful;',
      },
    ]);
    const snap = await indexedSnapshotRepo("never-forward", repo, commit);
    expect(snap.index?.inspection?.initial_paths).toHaveLength(48);
    expect(snap.index?.inspection?.followup_paths).toEqual([
      "zz-helper.ts",
      "zz-value.ts",
      "tests/aaa.test.ts",
    ]);
    expect(snap.files).toHaveLength(64);
    const target = snap.index?.targets.find((t) => t.symbol === "useful")!;
    expect(target.supporting_paths).toEqual(["zz-helper.ts", "zz-value.ts"]);
    expect(target.unresolved).toEqual([]);
    expect(target.test_paths).toEqual(["tests/aaa.test.ts"]);
  });
  it("verifies follow-up blobs and stops source reads at the overall inspection deadline", async () => {
    const files = [
      {
        path: "aaa.ts",
        content: 'import x from "./zz-helper"; export const value = x;',
      },
      ...Array.from({ length: 60 }, (_, i) => ({
        path: `filler-${i}.ts`,
        content: "export const filler = 1;",
      })),
      {
        path: "zz-helper.ts",
        content: "export default 1;",
        sha: blob("different"),
      },
    ];
    transport(files);
    await expect(indexedSnapshotRepo("t", repo, commit)).rejects.toThrow(
      /Git blob/,
    );
    const fetch = transport(files.map(({ sha: _sha, ...file }) => file));
    const clock = vi.spyOn(Date, "now").mockReturnValue(0);
    vi.stubGlobal("fetch", async (...args: Parameters<typeof fetch>) => {
      const response = await fetch(...args);
      if (!String(args[0]).includes("/git/trees/"))
        clock.mockReturnValue(120_001);
      return response;
    });
    try {
      const snap = await indexedSnapshotRepo("t", repo, commit);
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(snap.files).toHaveLength(1);
      expect(snap.index?.inspection?.deadline_reached).toBe(true);
      expect(
        snap.index?.skipped.every((s) => s.reason === "inspection_time_limit"),
      ).toBe(true);
    } finally {
      clock.mockRestore();
    }
  });
});
