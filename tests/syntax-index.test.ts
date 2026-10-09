import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { indexSources, evidencePacket } from "../src/lib/source-index";
const corpus = JSON.parse(
  fs.readFileSync("examples/cross-language-evaluation/corpus.json", "utf8"),
);
const index = (path: string, content: string) =>
  indexSources([{ path, content }], [path]);
describe("bounded Go and Rust concrete syntax indexing", () => {
  it("indexes complete Go receiver methods, aliases, helpers and grouped types without executing init", () => {
    const source =
      'package p\ntype (R struct {h H}; H func(string) uint64)\nfunc init(){ panic("DO NOT EXECUTE") }\nfunc (r *R) Lookup(s string) uint64 { return helper(r.h(s)) }\nfunc helper(x uint64) uint64 { return x ^ 17 }';
    const i = index("x.go", source);
    expect(i.files[0].parser).toBe("go");
    expect(i.targets.map((t) => t.symbol)).toEqual([
      "R",
      "H",
      "init",
      "R.Lookup",
      "helper",
    ]);
    expect(new Set(i.references.map((r) => r.id)).size).toBe(
      i.references.length,
    );
    const t = i.targets.find((t) => t.symbol === "R.Lookup")!,
      g = i.support_graph!.find((g) => g.reference_id === t.reference_id)!;
    expect(g.observation).toBe("go-cst-names-v1");
    expect(g.candidates.map((c) => c.symbol)).toContain("helper");
    expect(g.candidates.map((c) => c.symbol)).toContain("R");
    expect(t.unresolved.join(" ")).toContain("build constraints");
  });
  it("observes Rust functions, complete attributes, type units and enclosing impls", () => {
    const source =
      'use std::cmp::min;\nstruct W(u64);\nimpl W { #[cfg(feature="a")] fn get(&self)->u64 { self.0 } }\n#[cfg(feature="b")] pub fn distance(x:u64)->u64 { helper(x) }\nfn helper(x:u64)->u64 { min(x,3) }';
    const i = index("x.rs", source);
    expect(i.files[0].parser).toBe("rust");
    const d = i.targets.find((t) => t.symbol === "distance")!;
    expect(i.references.find((r) => r.id === d.reference_id)!.content).toMatch(
      /^#\[cfg/,
    );
    expect(d.unresolved.join(" ")).toContain("Conditional Rust");
    const method = i.targets.find((t) => t.symbol === "W::get")!;
    expect(
      i.references.find((r) => r.id === method.reference_id)!.content,
    ).toMatch(/^#\[cfg/);
    const g = i.support_graph!.find(
      (g) => g.reference_id === method.reference_id,
    )!;
    expect(g.candidates.some((c) => c.relation === "enclosing-impl")).toBe(
      true,
    );
  });
  it("preserves exact Unicode, BOM and CRLF source coordinates and full-file hashes", () => {
    for (const [path, source, symbol] of [
      [
        "x.go",
        '\ufeff// ☃💡\r\npackage p\r\nfunc 名() string { return "😀" }',
        "名",
      ],
      [
        "x.rs",
        '\ufeff// ☃💡\r\n// second line\r\npub fn 名() -> &\'static str { "😀" }',
        "名",
      ],
    ]) {
      const i = index(path, source),
        t = i.targets.find((t) => t.symbol === symbol)!;
      expect(t).toBeDefined();
      const r = i.references.find((r) => r.id === t.reference_id)!;
      expect(source.includes(r.content)).toBe(true);
      expect(r.start_line).toBe(3);
      expect(r.end_line).toBe(3);
      expect(r.sha256).toBe(i.files[0].sha256);
    }
  });
  it("never mistakes function-looking comments, raw strings or macro token bodies for declarations", () => {
    for (const [path, source] of [
      [
        "x.go",
        "package p\n// func Fake() {}\nconst s=`func Fake() {}`\nfunc Real() {}",
      ],
      [
        "x.rs",
        '// pub fn Fake() {}\nconst S:&str=r#"pub fn Fake() {}"#; macro_rules! foo { () => {fn Fake(){}} } pub fn Real(){}',
      ],
    ]) {
      expect(index(path, source).targets.map((t) => t.symbol)).toEqual([
        "Real",
      ]);
    }
  });
  it("reports ambiguity and conservative shadowing, preserving distinct duplicate declarations", () => {
    const i = index(
      "x.rs",
      "fn helper()->usize {1} #[cfg(a)] fn same()->usize {1} #[cfg(b)] fn same()->usize {2} pub fn top(helper:fn()->usize)->usize { helper()+same() }",
    );
    expect(new Set(i.targets.map((t) => t.id)).size).toBe(i.targets.length);
    const t = i.targets.find((t) => t.symbol === "top")!,
      g = i.support_graph!.find((g) => g.reference_id === t.reference_id)!;
    expect(g.gaps).toContainEqual({
      symbol: "helper",
      reason: "local-binding-observed",
    });
    expect(g.gaps).toContainEqual({
      symbol: "same",
      reason: "ambiguous-or-conditional-binding",
    });
    expect(g.candidates.some((c) => c.symbol === "helper")).toBe(false);
  });
  it("does not resolve method spellings with multiple receiver candidates", () => {
    const i = index(
      "x.go",
      "package p\ntype A struct{}; type B struct{}\nfunc (a A) F() {}\nfunc (b B) F() {}\nfunc Call(a A){ a.F() }",
    );
    const t = i.targets.find((t) => t.symbol === "Call")!,
      g = i.support_graph!.find((g) => g.reference_id === t.reference_id)!;
    expect(g.gaps).toContainEqual({
      symbol: "F",
      reason: "ambiguous-or-conditional-binding",
    });
    expect(g.candidates.some((c) => c.relation === "member-spelling")).toBe(
      false,
    );
  });
  it("supplies complete Go receiver/helper units when full-file context cannot fit", () => {
    const i = index(
      "large.go",
      "package p\ntype R struct {}\nfunc (r R) Lookup(x int) int {return helper(x)}\nfunc helper(x int) int {return x+1}\n//" +
        "padding".repeat(3000),
    );
    const t = i.targets.find((t) => t.symbol === "R.Lookup")!,
      p = evidencePacket({ ...i, targets: [t] }, 2500);
    expect(p.targets).toHaveLength(1);
    expect(p.contexts![0].same_file_reference).toBe(null);
    expect(p.scoped_contexts![0].observation).toBe("go-cst-names-v1");
    expect(
      p.scoped_contexts![0].references.some(
        (r) => r.symbol === "R" && r.relation === "receiver-type",
      ),
    ).toBe(true);
    expect(
      p.scoped_contexts![0].references.some((r) => r.symbol === "helper"),
    ).toBe(true);
    expect(JSON.stringify(p).length).toBeLessThanOrEqual(2500);
  });
  it("keeps conditional Rust imports, wildcard imports and conditional member spellings as gaps", () => {
    const i = index(
      "x.rs",
      "#[cfg(a)] use crate::conditional;\nuse std::io::*;\nstruct W; impl W {#[cfg(a)] fn run(&self) {}}\npub fn call(w: W) { w.run(); }",
    );
    expect(
      i.files[0].imports.find((v) => v.specifier.includes("conditional"))?.kind,
    ).toBe("dynamic");
    const t = i.targets.find((t) => t.symbol === "call")!,
      g = i.support_graph!.find((g) => g.reference_id === t.reference_id)!;
    expect(g.gaps).toContainEqual({
      symbol: "run",
      reason: "ambiguous-or-conditional-binding",
    });
    expect(g.gaps.some((v) => v.reason === "wildcard-import")).toBe(true);
    expect(g.candidates.some((v) => v.relation === "member-spelling")).toBe(
      false,
    );
  });
  it("rejects malformed and incomplete files, and falls back explicitly when parser budgets are exceeded", () => {
    for (const path of ["x.go", "x.rs"]) {
      const i = index(
        path,
        path.endsWith(".go") ? "package p\nfunc broken( {" : "pub fn broken( {",
      );
      expect(i.files[0].parser).toBe("parse_error");
      expect(i.targets).toEqual([]);
    }
    const i = indexSources(
      [{ path: "x.go", content: "package p\nfunc F(){}", truncated: true }],
      ["x.go"],
    );
    expect(i.targets).toEqual([]);
    expect(i.skipped[0].reason).toBe("incomplete_file");
    const crowded = index(
      "x.go",
      "package p\n" +
        Array.from({ length: 300 }, (_, i) => `func F${i}(){}`).join("\n"),
    );
    expect(crowded.files[0].parser).toBe("file");
    expect(
      crowded.skipped.some((s) => s.reason === "syntax_parser_unavailable"),
    ).toBe(true);
    expect(crowded.targets[0].symbol).toBe("<module>");
  });
  it("supplies an exact bounded Rust function and complete supporting units without full-module context", () => {
    const r = corpus.repositories.find(
        (r: any) => r.repo === "rapidfuzz/strsim-rs",
      ),
      i = indexSources(r.files, r.knownPaths, r.skipped),
      target = i.targets.find((t) => t.symbol === "levenshtein")!;
    const packet = evidencePacket({ ...i, targets: [target] }, 12000);
    expect(packet.selection_policy).toBe("repo-salvage/coverage-v5");
    expect(JSON.stringify(packet).length).toBeLessThanOrEqual(12000);
    expect(packet.contexts![0].same_file_reference).toBe(null);
    const g = packet.scoped_contexts![0];
    expect(g.observation).toBe("rust-cst-names-v1");
    for (const name of [
      "generic_levenshtein",
      "StringWrapper",
      "impl IntoIterator for &StringWrapper<'b>",
      "use std::str::Chars;",
    ])
      expect(g.references.some((r) => r.symbol === name)).toBe(true);
    for (const r of packet.references)
      expect(
        i.references.some((o) => o.id === r.id && o.content === r.content),
      ).toBe(true);
  });
  it("preserves Python v4 packets and does not label native observations as Python under older policies", () => {
    const i = index(
      "x.go",
      "package p\nfunc F(x int) int {return H(x)}\nfunc H(x int) int{return x}",
    );
    const p = evidencePacket(i, 2000, "repo-salvage/coverage-v4");
    expect(p.scoped_contexts).toEqual([]);
    const py = index("x.py", "N = 3\ndef f():\n    return N\n");
    const old = evidencePacket(py, 2000, "repo-salvage/coverage-v4"),
      next = evidencePacket(py, 2000, "repo-salvage/coverage-v5");
    next.selection_policy = "repo-salvage/coverage-v4";
    expect(next).toEqual(old);
  });
});
