import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import fs from "node:fs";
import Ajv from "ajv/dist/2020";
import {
  indexSources,
  evidencePacket,
  type IndexedInput,
} from "../src/lib/source-index";
import { focusedEvidence, focusedResponse } from "../src/lib/focused-evidence";
const index = (files: Record<string, string>, known = Object.keys(files)) =>
  indexSources(
    Object.entries(files).map(([path, content]) => ({ path, content })),
    known,
  );
const select = (
  i: ReturnType<typeof index>,
  path: string,
  symbol: string,
  limit = 12000,
) =>
  evidencePacket(
    {
      ...i,
      targets: i.targets.filter((t) => t.path === path && t.symbol === symbol),
    },
    limit,
  );
const go = {
  "p/main.go": "package p\nfunc Value() int { return helper() }",
  "p/helper.go": "package p\nfunc helper() int { return 7 }",
};
const rust = {
  "src/lib.rs": "mod helper;\npub fn value()->u32 { helper::number() }",
  "src/helper.rs": "pub fn number()->u32 { 7 }",
};
afterEach(() => vi.unstubAllGlobals());
describe("bounded direct native file context", () => {
  it("supplies complete same-package Go source without executing init or pretending to resolve bindings", () => {
    const i = index({
      ...go,
      "p/init.go": 'package p\nfunc init() { panic("not executed") }',
      "p/other.go": "package other\nfunc helper() int{return 99}",
      "p/main_test.go": "package p\nfunc TestValue() {}",
      "p/_ignored.go": "package p\nfunc Hidden() {}",
      "q/else.go": "package p\nfunc Else() {}",
    });
    const p = select(i, "p/main.go", "Value");
    const c = p.file_contexts![0];
    expect(c.observation).toBe("go-package-files-v1");
    expect(c.files).toHaveLength(3);
    expect(c.files.find((f) => f.path === "p/other.go")).toEqual({
      path: "p/other.go",
      reason: "package-mismatch",
      reference_id: null,
    });
    for (const path of ["p/helper.go", "p/init.go"]) {
      const f = c.files.find((f) => f.path === path)!;
      expect(f.reason).toBe("supplied");
      expect(p.references.find((r) => r.id === f.reference_id)?.kind).toBe(
        "file",
      );
    }
    expect(p.targets[0].supporting_paths).toEqual(["p/helper.go", "p/init.go"]);
    expect(p.targets[0].unresolved.join(" ")).toContain("build selection");
    expect(JSON.stringify(p)).not.toContain("return 99");
  });
  it("does not evaluate Go build tags, platform suffixes, cgo or package initialization", () => {
    const source =
      '//go:build windows\n\npackage p\nimport "C"\nfunc helper() int {return 7}';
    const p = select(
      index({ ...go, "p/windows_windows.go": source }),
      "p/main.go",
      "Value",
    );
    const f = p.file_contexts![0].files.find(
      (f) => f.path === "p/windows_windows.go",
    )!;
    expect(f.reason).toBe("supplied");
    expect(p.references.find((r) => r.id === f.reference_id)?.content).toBe(
      source,
    );
    expect(p.targets[0].unresolved.join(" ")).toContain("build constraints");
  });
  it("follows conventional external Rust modules and retains complete bytes", () => {
    const p = select(index(rust), "src/lib.rs", "value");
    expect(p.file_contexts![0]).toMatchObject({
      path: "src/lib.rs",
      observation: "rust-module-files-v1",
      candidates_omitted: 0,
      files: [{ path: "src/helper.rs", reason: "supplied" }],
    });
    expect(p.references.find((r) => r.path === "src/helper.rs")?.content).toBe(
      rust["src/helper.rs"],
    );
    expect(
      p.scoped_contexts?.every((c) =>
        c.references.every(
          (v) =>
            p.references.find((r) => r.id === v.reference_id)?.path ===
            "src/lib.rs",
        ),
      ),
    ).toBe(true);
  });
  it("retains ordinary crate attributes without evaluating conditional configuration", () => {
    const p = select(
      index({
        ...rust,
        "src/lib.rs": "#![no_std]\nmod helper; pub fn value(){}",
      }),
      "src/lib.rs",
      "value",
    );
    expect(p.file_contexts![0].files[0].reason).toBe("supplied");
  });
  it("uses Rust non-root module directories and mod.rs directories, including raw identifiers", () => {
    for (const parent of ["src/outer.rs", "src/outer/mod.rs"]) {
      const p = select(
        index({
          [parent]: "mod r#type;\npub fn value(){}",
          "src/outer/type.rs": "pub fn number(){}",
        }),
        parent,
        "value",
      );
      expect(p.file_contexts![0].files[0].path).toBe("src/outer/type.rs");
      expect(p.file_contexts![0].files[0].reason).toBe("supplied");
    }
  });
  it("rejects cfg, custom paths, all attributes, duplicate declarations and competing Rust layouts", () => {
    for (const mod of [
      '#[cfg(feature="a")] mod helper;',
      '#[path="../else.rs"] mod helper;',
      "#[allow(unused)] mod helper;",
      '#![cfg(feature="a")]\nmod helper;',
    ]) {
      const p = select(
        index({ ...rust, "src/lib.rs": mod + "\npub fn value() {}" }),
        "src/lib.rs",
        "value",
      );
      expect(p.file_contexts![0].files[0].reason).toBe("restricted-module");
      expect(p.targets[0].supporting_paths).toEqual([]);
      expect(p.references.some((r) => r.path === "src/helper.rs")).toBe(false);
    }
    const p = select(
      index({ ...rust, "src/helper/mod.rs": "pub fn number()->u32 {9}" }),
      "src/lib.rs",
      "value",
    );
    expect(
      p.file_contexts![0].files.every(
        (f) => f.reason === "ambiguous-module-layout",
      ),
    ).toBe(true);
    const duplicate = select(
      index({
        ...rust,
        "src/lib.rs": "mod helper; mod helper; pub fn value(){}",
      }),
      "src/lib.rs",
      "value",
    );
    expect(duplicate.file_contexts![0].files[0].reason).toBe(
      "ambiguous-module-layout",
    );
  });
  it("does not infer relationships from inline modules, macro strings, use paths or filenames alone", () => {
    for (const content of [
      "mod helper {pub fn number(){}} pub fn value(){}",
      "use crate::helper; pub fn value(){}",
      'const S:&str="mod helper;"; pub fn value(){}',
    ]) {
      const p = select(
        index({ ...rust, "src/lib.rs": content }),
        "src/lib.rs",
        "value",
      );
      expect(p.file_contexts).toBeUndefined();
      expect(p.targets[0].supporting_paths).toEqual([]);
    }
  });
  it("distinguishes unread, malformed and truncated context without supplying it", () => {
    const unread = select(
      index({ "p/main.go": go["p/main.go"] }, Object.keys(go)),
      "p/main.go",
      "Value",
    );
    expect(unread.file_contexts![0].files[0].reason).toBe("not-inspected");
    const malformed = select(
      index({ ...go, "p/helper.go": "package p\nfunc broken( {" }),
      "p/main.go",
      "Value",
    );
    expect(malformed.file_contexts![0].files[0].reason).toBe(
      "parser-unavailable",
    );
    const inputs: IndexedInput[] = Object.entries(go).map(
      ([path, content]) => ({
        path,
        content,
        truncated: path.endsWith("helper.go"),
      }),
    );
    const p = select(
      indexSources(inputs, Object.keys(go)),
      "p/main.go",
      "Value",
    );
    expect(p.file_contexts![0].files[0].reason).toBe("parser-unavailable");
  });
  it("caps file candidates and records complete-file packet omissions for every small allowance", () => {
    const files = {
      ...go,
      "p/helper.go": go["p/helper.go"] + "\n//" + "x".repeat(30000),
      ...Object.fromEntries(
        Array.from({ length: 25 }, (_, i) => [
          `p/a${i}.go`,
          `package p\nfunc H${i}(){}`,
        ]),
      ),
    };
    const i = index(files);
    expect(
      i.file_contexts!.find((c) => c.path === "p/main.go")!.files,
    ).toHaveLength(16);
    expect(
      i.file_contexts!.find((c) => c.path === "p/main.go")!.candidates_omitted,
    ).toBe(10);
    const pair = index({ ...go, "p/helper.go": files["p/helper.go"] });
    for (let limit = 1000; limit <= 7000; limit += 97) {
      const p = select(pair, "p/main.go", "Value", limit);
      expect(JSON.stringify(p).length).toBeLessThanOrEqual(limit);
      for (const c of p.file_contexts ?? []) {
        expect(c.files.every((f) => f.reason !== "inspected")).toBe(true);
        expect(c.files.every((f) => f.reference_id === null)).toBe(true);
        expect(c.files.every((f) => f.reason === "packet-budget")).toBe(true);
      }
    }
  });
  it("keeps legacy policies free of the optional cross-file contract", () => {
    const i = index(go);
    expect(
      evidencePacket(i, 12000, "repo-salvage/coverage-v4").file_contexts,
    ).toBeUndefined();
  });
  it("retrieves pinned Go peers under the existing four-file allowance, preserves notices and rejects corrupt supporting blobs", async () => {
    const files = {
      ...go,
      LICENSE: "MIT",
      ...Object.fromEntries(
        Array.from({ length: 7 }, (_, i) => [
          `p/peer${i}.go`,
          "package p\nfunc Extra(){}",
        ]),
      ),
    };
    const commit = "a".repeat(40);
    let corrupt = false;
    const call = vi.fn(async (url: string) => {
      if (url.includes("/git/trees/"))
        return new Response(
          JSON.stringify({
            tree: Object.entries(files).map(([path, content]) => ({
              path,
              type: "blob",
              mode: "100644",
              sha: createHash("sha1")
                .update(`blob ${Buffer.byteLength(content)}\0`)
                .update(content)
                .digest("hex"),
              size: Buffer.byteLength(content),
            })),
          }),
        );
      const f = Object.entries(files).find(([path]) =>
        url.endsWith("/" + path),
      )!;
      return new Response(
        corrupt && f[0] === "p/helper.go" ? "corrupted" : f[1],
      );
    });
    vi.stubGlobal("fetch", call);
    const body = await focusedEvidence("author/repo", commit, {
      path: "p/main.go",
      symbol: "Value",
      maxCharacters: 12000,
    });
    expect(body.coverage.context_paths).toHaveLength(4);
    expect(body.coverage.context_paths[0]).toBe("LICENSE");
    expect(call).toHaveBeenCalledTimes(6);
    expect(
      body.packet.file_contexts![0].files.filter(
        (f) => f.reason === "supplied",
      ),
    ).toHaveLength(3);
    expect(
      body.packet.file_contexts![0].files.filter(
        (f) => f.reason === "not-inspected",
      ),
    ).toHaveLength(5);
    const response = focusedResponse(
      {
        id: 1,
        github_repo_id: 42,
        owner_id: 7,
        full_name: "author/repo",
        source_sha: commit,
      },
      body,
    );
    const check = new Ajv({ strict: false }).compile(
      JSON.parse(fs.readFileSync("public/openapi.json", "utf8")).components
        .schemas.FocusedEvidence,
    );
    expect(check(response), JSON.stringify(check.errors)).toBe(true);
    corrupt = true;
    await expect(
      focusedEvidence("author/repo", commit, {
        path: "p/main.go",
        symbol: "Value",
        maxCharacters: 12000,
      }),
    ).rejects.toMatchObject({ code: "source_integrity_failed" });
  });
});
