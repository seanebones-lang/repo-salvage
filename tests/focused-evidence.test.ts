import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import fs from "node:fs";
import Ajv from "ajv/dist/2020";
import {
  focusedEvidence,
  focusedResponse,
  evidenceFocus,
  createEvidenceCache,
  FOCUS_LIMITS,
} from "@/lib/focused-evidence";
const commit = "a".repeat(40);
const focus = (
  path: string,
  symbol: string | null = null,
  maxCharacters = 12000,
) => ({ path, symbol, maxCharacters });
const blob = (content: string) =>
  createHash("sha1")
    .update(`blob ${Buffer.byteLength(content)}\0`)
    .update(content)
    .digest("hex");
const identity = {
  id: 1,
  github_repo_id: 42,
  owner_id: 7,
  full_name: "author/repo",
  source_sha: commit,
};
function transport(
  files: {
    path: string;
    content: string;
    mode?: string;
    sha?: string;
    size?: number;
  }[],
) {
  const call = vi.fn(async (url: string, init: RequestInit) => {
    expect(init.headers ?? {}).not.toHaveProperty("Authorization");
    expect(url).toContain(commit);
    if (url.includes("/git/trees/"))
      return new Response(
        JSON.stringify({
          tree: files.map((f) => ({
            path: f.path,
            type: "blob",
            mode: f.mode ?? "100644",
            sha: f.sha ?? blob(f.content),
            size: f.size ?? Buffer.byteLength(f.content),
          })),
        }),
      );
    const file = files.find((f) =>
      url.endsWith(f.path.split("/").map(encodeURIComponent).join("/")),
    );
    expect(file).toBeDefined();
    expect(init.redirect).toBe("error");
    return new Response(file!.content);
  });
  vi.stubGlobal("fetch", call);
  return call;
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("focused complete source evidence", () => {
  it("reports excluded long paths within a valid output contract without allowing retrieval", async () => {
    const path = "lib/" + "x".repeat(513) + ".ts";
    const call = transport([{ path, content: "export const x=1;" }]);
    const value = focusedResponse(
      identity,
      await focusedEvidence(identity.full_name, commit, focus("lib/")),
    );
    const schema = JSON.parse(fs.readFileSync("public/openapi.json", "utf8"))
      .components.schemas.FocusedEvidence;
    const check = new Ajv({ strict: false }).compile(schema);
    expect(check(value), JSON.stringify(check.errors)).toBe(true);
    expect(value.coverage.files[0].path).toBe(path);
    expect(value.coverage.files[0].reason).toBe("unsupported_path_or_mode");
    expect(value.coverage.files[0].download_url).toBeNull();
    expect(value.packet.references).toEqual([]);
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("reserves context capacity, caps follow-up reads and exposes remaining dependencies", async () => {
    const call = transport([
      {
        path: "src/main.ts",
        content:
          Array.from({ length: 6 }, (_, i) => `import '../dep${i}.ts';`).join(
            "\n",
          ) + "\nexport const value = 1;",
      },
      ...Array.from({ length: 6 }, (_, i) => ({
        path: `dep${i}.ts`,
        content: "export const value = 1;",
      })),
      { path: "LICENSE", content: "MIT" },
    ]);
    const data = await focusedEvidence(
      identity.full_name,
      commit,
      focus("src/main.ts"),
    );
    expect(data.coverage.context_paths).toHaveLength(4);
    expect(data.coverage.context_paths[0]).toBe("LICENSE");
    expect(
      data.coverage.skipped.filter((f) => f.reason === "context_file_limit"),
    ).toHaveLength(3);
    expect(call).toHaveBeenCalledTimes(6);
    expect(
      data.packet.targets[0].unresolved.some((s) =>
        s.startsWith("Imports not statically inspected:"),
      ),
    ).toBe(true);
  });
  it("records byte and deadline omissions without new reads after the deadline", async () => {
    transport([
      ...Array.from({ length: 4 }, (_, i) => ({
        path: `src/f${i}.ts`,
        content: "/*" + "x".repeat(60000) + "*/",
      })),
      { path: "LICENSE", content: "MIT" },
    ]);
    const data = await focusedEvidence(
      identity.full_name,
      commit,
      focus("src/"),
    );
    expect(
      data.coverage.files.filter((f) => f.inspection === "complete"),
    ).toHaveLength(3);
    expect(
      data.coverage.files.filter((f) => f.reason === "byte_limit"),
    ).toHaveLength(1);
    expect(data.coverage.context_paths).toContain("LICENSE");
    let now = 1;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const original = transport([
      { path: "src/a.ts", content: "export const a=1;" },
      { path: "src/b.ts", content: "export const b=2;" },
    ]);
    const request = globalThis.fetch;
    vi.stubGlobal("fetch", async (...args: Parameters<typeof fetch>) => {
      const response = await request(...args);
      if (String(args[0]).includes("raw.githubusercontent")) now += 20001;
      return response;
    });
    const expired = await focusedEvidence(
      identity.full_name,
      commit,
      focus("src/"),
    );
    expect(expired.coverage.files[1].reason).toBe("read_deadline");
    expect(original).toHaveBeenCalledTimes(2);
  });
  it("evicts completed cached responses above the eight-entry bound", async () => {
    transport([{ path: "x.ts", content: "export const x=1;" }]);
    const value = await focusedEvidence(
      identity.full_name,
      commit,
      focus("x.ts"),
    );
    const load = vi.fn(async () => value);
    const cached = createEvidenceCache(load);
    for (let i = 0; i < 9; i++)
      await cached(String(i), identity.full_name, commit, focus("x.ts"));
    await cached("0", identity.full_name, commit, focus("x.ts"));
    expect(load).toHaveBeenCalledTimes(10);
  });
  it("rejects unsafe, repeated, directory-symbol and excessive parameters before transport", () => {
    for (const q of [
      "",
      "path=../x.ts",
      "path=src//x",
      "path=src/&symbol=foo",
      "path=x.ts&path=y.ts",
      "path=x.ts&execute=1",
      "path=x.ts&max_characters=999",
      "path=x.ts&max_characters=24001",
      "path=x.ts&symbol=",
    ])
      expect(() => evidenceFocus(new URLSearchParams(q))).toThrow();
    expect(
      evidenceFocus(new URLSearchParams("path=src/&max_characters=24000")),
    ).toEqual(focus("src/", null, 24000));
  });
  it("finds an exact declaration in a later source area without reading unrelated routes", async () => {
    const call = transport([
      ...Array.from({ length: 100 }, (_, i) => ({
        path: `app/r${i}/route.ts`,
        content: "export function GET(){return 1;}",
      })),
      {
        path: "late/module.py",
        content: "class Client:\n    def request(self):\n        return 7\n",
      },
      { path: "LICENSE", content: "MIT notice" },
    ]);
    const data = focusedResponse(
      identity,
      await focusedEvidence(
        identity.full_name,
        commit,
        focus("late/module.py", "Client.request"),
      ),
    );
    expect(data.packet.targets.map((t) => t.symbol)).toEqual([
      "Client.request",
    ]);
    expect(data.packet.contexts![0].same_file_reference).toBeTruthy();
    expect(data.coverage.context_paths).toContain("LICENSE");
    expect(call).toHaveBeenCalledTimes(3);
    expect(data.interpretation).toBe("none");
  });
  it("returns an unindexed helper's complete file without inventing a target", async () => {
    transport([
      {
        path: "lib/x.ts",
        content: "const hidden = () => 7;\nexport const visible = 1;",
      },
    ]);
    const data = await focusedEvidence(
      identity.full_name,
      commit,
      focus("lib/x.ts", "hidden"),
    );
    expect(data.focus.symbol_match).toBe("not_indexed");
    expect(data.packet.targets).toEqual([]);
    expect(
      data.packet.references.some(
        (r) => r.kind === "file" && r.content.includes("const hidden"),
      ),
    ).toBe(true);
    expect(data.coverage.files[0].same_file_supplied).toBe(true);
  });
  it("reports scope/file exclusions and enforces eight primary plus four context reads", async () => {
    const call = transport([
      ...Array.from({ length: 12 }, (_, i) => ({
        path: `lib/f${String(i).padStart(2, "0")}.ts`,
        content: "export const value = 1;",
      })),
      { path: "lib/link.ts", content: "x", mode: "120000" },
      { path: "lib/huge.ts", content: "x", size: 64001 },
      { path: "LICENSE", content: "MIT" },
    ]);
    const data = await focusedEvidence(
      identity.full_name,
      commit,
      focus("lib/"),
    );
    expect(
      data.coverage.files.filter((f) => f.inspection === "complete"),
    ).toHaveLength(8);
    expect(
      data.coverage.files.filter((f) => f.reason === "file_limit"),
    ).toHaveLength(4);
    expect(
      data.coverage.files.find((f) => f.path === "lib/link.ts")!.reason,
    ).toBe("unsupported_path_or_mode");
    expect(
      data.coverage.files.find((f) => f.path === "lib/huge.ts")!.reason,
    ).toBe("file_byte_limit");
    expect(call).toHaveBeenCalledTimes(10);
  });
  it("withholds source on a Git blob mismatch and excludes invalid UTF-8", async () => {
    transport([
      {
        path: "lib/x.ts",
        content: "export const x = 2;",
        sha: blob("export const x = 1;"),
      },
    ]);
    await expect(
      focusedEvidence(identity.full_name, commit, focus("lib/x.ts")),
    ).rejects.toMatchObject({ code: "source_integrity_failed" });
    const bytes = Buffer.from([0xff]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.includes("/git/trees/")
          ? new Response(
              JSON.stringify({
                tree: [
                  {
                    path: "x.ts",
                    type: "blob",
                    mode: "100644",
                    sha: createHash("sha1")
                      .update(Buffer.concat([Buffer.from("blob 1\0"), bytes]))
                      .digest("hex"),
                    size: 1,
                  },
                ],
              }),
            )
          : new Response(bytes),
      ),
    );
    const data = await focusedEvidence(
      identity.full_name,
      commit,
      focus("x.ts"),
    );
    expect(data.packet.targets).toEqual([]);
    expect(data.coverage.files[0].reason).toBe("unsupported_encoding");
  });
  it("omits a complete block when it cannot fit rather than supplying a source prefix", async () => {
    transport([
      {
        path: "main.rs",
        content: 'fn main(){ let x="' + "x".repeat(5000) + '"; }',
      },
    ]);
    const data = await focusedEvidence(
      identity.full_name,
      commit,
      focus("main.rs", null, 1000),
    );
    expect(data.coverage.files[0].inspection).toBe("complete");
    expect(data.packet.targets).toEqual([]);
    expect(data.packet.references).toEqual([]);
    expect(data.packet.omitted_targets).toBe(1);
  });
  it("rejects broad or nonexistent scopes before downloading any source", async () => {
    const call = transport(
      Array.from({ length: 33 }, (_, i) => ({
        path: `lib/f${i}.ts`,
        content: "export const x=1",
      })),
    );
    await expect(
      focusedEvidence(identity.full_name, commit, focus("lib/")),
    ).rejects.toMatchObject({ code: "focus_too_broad" });
    await expect(
      focusedEvidence(identity.full_name, commit, focus("other.ts")),
    ).rejects.toMatchObject({ code: "focus_not_found" });
    expect(call).toHaveBeenCalledTimes(2);
  });
  it("bounds Unicode output bytes while preserving complete blocks", async () => {
    transport(
      Array.from({ length: 8 }, (_, i) => ({
        path: `lib/f${i}.ts`,
        content: `export const value = "${"界".repeat(4000)}";`,
      })),
    );
    const data = focusedResponse(
      identity,
      await focusedEvidence(
        identity.full_name,
        commit,
        focus("lib/", null, 24000),
      ),
    );
    expect(Buffer.byteLength(JSON.stringify(data))).toBeLessThanOrEqual(
      FOCUS_LIMITS.responseBytes,
    );
    for (const ref of data.packet.references)
      expect(ref.content.endsWith(";")).toBe(true);
  });
  it("coalesces pending requests, expires successful values and does not cache failures", async () => {
    transport([{ path: "x.ts", content: "export const x=1;" }]);
    const value = await focusedEvidence(
      identity.full_name,
      commit,
      focus("x.ts"),
    );
    const load = vi.fn(async () => value);
    let now = 1;
    const cached = createEvidenceCache(load, () => now);
    await Promise.all([
      cached("1", identity.full_name, commit, focus("x.ts")),
      cached("1", identity.full_name, commit, focus("x.ts")),
    ]);
    expect(load).toHaveBeenCalledTimes(1);
    now += 60001;
    await cached("1", identity.full_name, commit, focus("x.ts"));
    expect(load).toHaveBeenCalledTimes(2);
    load.mockRejectedValueOnce(Error("upstream"));
    await expect(
      cached("2", identity.full_name, commit, focus("x.ts")),
    ).rejects.toThrow("upstream");
    await cached("2", identity.full_name, commit, focus("x.ts"));
    expect(load).toHaveBeenCalledTimes(4);
  });
  it("bounds concurrent distinct requests while permitting coalesced consumers", async () => {
    const load = vi.fn(
      () => new Promise<Awaited<ReturnType<typeof focusedEvidence>>>(() => {}),
    );
    const cached = createEvidenceCache(load);
    const first = cached("1", identity.full_name, commit, focus("x.ts"));
    for (const id of ["2", "3", "4"])
      cached(id, identity.full_name, commit, focus("x.ts"));
    expect(cached("1", identity.full_name, commit, focus("x.ts"))).toBe(first);
    expect(() =>
      cached("5", identity.full_name, commit, focus("x.ts")),
    ).toThrow("busy");
  });
});
