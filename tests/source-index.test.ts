import { describe, expect, it } from "vitest";
import { indexSources, evidencePacket, indexRecord } from "@/lib/source-index";

describe("source index evidence", () => {
  it("gives other files a turn before repeating a file with many declarations", () => {
    const files = [
      {
        path: "a.ts",
        content: Array.from(
          { length: 100 },
          (_, i) => `export function f${i}() { return ${i}; }`,
        ).join("\n"),
      },
      { path: "z.py", content: "def late():\n    return 1\n" },
    ];
    const index = indexSources(
      files,
      files.map((f) => f.path),
    );
    const packet = evidencePacket(index);
    expect(packet.targets.length).toBeLessThanOrEqual(24);
    expect(packet.targets.some((t) => t.symbol === "late")).toBe(true);
    expect(
      packet.targets
        .slice(0, 2)
        .map((t) => t.path)
        .sort(),
    ).toEqual(["a.ts", "z.py"]);
    expect(JSON.stringify(packet).length).toBeLessThanOrEqual(70000);
    expect(
      evidencePacket(indexSources([...files].reverse(), ["z.py", "a.ts"])),
    ).toEqual(packet);
  });
  it("prefers fewer observed module bindings within a file without treating the hint as a dependency guarantee", () => {
    const files = [
      {
        path: "lib/cache.ts",
        content:
          "const store = new Map(); const order: string[] = []; function normalize(x: string) { return x.trim(); } export function lookup(k: string) { order.push(k); return store.get(k); } export function buildKey(k: string) { return normalize(k); }",
      },
      ...Array.from({ length: 23 }, (_, i) => ({
        path: `lib/u${i}.ts`,
        content: `export function u${i}() { return 1; }`,
      })),
    ];
    const packet = evidencePacket(
      indexSources(
        files,
        files.map((f) => f.path),
      ),
    );
    expect(packet.targets.find((t) => t.path === "lib/cache.ts")?.symbol).toBe(
      "buildKey",
    );
    const context = packet.contexts!.find(
      (c) =>
        c.target_id === packet.targets.find((t) => t.symbol === "buildKey")!.id,
    )!;
    expect(
      packet.references.find((r) => r.id === context.same_file_reference)
        ?.content,
    ).toContain("function normalize");
  });
  it("states omitted same-file context without sending a truncated module", () => {
    const files = [
      {
        path: "x.ts",
        content:
          "/*" +
          "x".repeat(10000) +
          "*/ export function small() { return helper(); } function helper() { return 1; }",
      },
    ];
    const packet = evidencePacket(indexSources(files, ["x.ts"]), 2000);
    expect(packet.targets).toHaveLength(1);
    expect(packet.contexts![0].same_file_reference).toBeNull();
    expect(packet.references.every((r) => r.kind === "declaration")).toBe(true);
    expect(JSON.stringify(packet).length).toBeLessThanOrEqual(2000);
  });
  it("bounds the complete serialized packet including JSON escaping and envelope overhead", () => {
    const files = Array.from({ length: 40 }, (_, i) => ({
      path: `quoted-${i}.ts`,
      content: `export const value${i} = ${JSON.stringify('"\\\n'.repeat(600))};`,
    }));
    const index = indexSources(
      files,
      files.map((f) => f.path),
    );
    for (const limit of [200, 500, 1000, 5000, 70000]) {
      const packet = evidencePacket(index, limit);
      expect(JSON.stringify(packet).length).toBeLessThanOrEqual(limit);
      for (const target of packet.targets)
        expect(
          packet.references.some((r) => r.id === target.reference_id),
        ).toBe(true);
      expect(packet.omitted_targets).toBe(
        index.targets.length - packet.targets.length,
      );
    }
    expect(() => evidencePacket(index, 1)).toThrow(/envelope/);
  });
  it("finds tiny exports and complete declarations beyond the former prefix and size limits", () => {
    const files = [
      {
        path: "tiny.ts",
        content: "export const twice = (n: number) => n * 2;",
      },
      {
        path: "large.ts",
        content:
          "/*" +
          "x".repeat(25_000) +
          "*/\nexport function last(n: number) { return n + 1; }",
      },
    ];
    const index = indexSources(
      files,
      files.map((f) => f.path),
    );
    expect(index.targets.map((t) => t.symbol)).toEqual(["last", "twice"]);
    const packet = evidencePacket(index);
    expect(packet.targets).toHaveLength(2);
    expect(
      packet.references.find(
        (r) => r.kind === "declaration" && r.path === "large.ts",
      )?.content,
    ).toBe("export function last(n: number) { return n + 1; }");
    expect(JSON.stringify(indexRecord(index, packet))).not.toContain(
      "export function",
    );
  });
  it("traces transitive static imports and cycles, records aliases/computed imports and associates imported tests", () => {
    const files = [
      {
        path: "src/a.ts",
        content:
          'import { b } from "./b.js"; import x from "@/settings"; export function a() { return b(); }',
      },
      {
        path: "src/b.ts",
        content:
          'import { a } from "./a"; import fs from "node:fs"; export function b() { return a; } const module = import(path);',
      },
      {
        path: "tests/a.test.ts",
        content: 'import { a } from "../src/a"; a();',
      },
      { path: "LICENSE", content: "MIT" },
      { path: "src/LICENSE", content: "MPL-2.0" },
    ];
    const index = indexSources(
      files,
      files.map((f) => f.path),
    );
    const target = index.targets.find((t) => t.symbol === "a")!;
    expect(target.supporting_paths).toEqual(["src/b.ts"]);
    expect(target.unresolved).toEqual([
      "src/a.ts: @/settings",
      "src/b.ts: <computed import>",
    ]);
    expect(target.test_paths).toEqual(["tests/a.test.ts"]);
    expect(target.notice_paths).toEqual(["LICENSE", "src/LICENSE"]);
    expect(index.targets.some((t) => t.path.includes("test"))).toBe(false);
  });
  it("withholds declaration coverage for parse errors, prefixes and unsupported languages", () => {
    const files = [
      { path: "bad.ts", content: "export function x( {" },
      { path: "cut.ts", content: "export function x() {}", truncated: true },
      { path: "parser.rb", content: "def parse(x); x; end" },
    ];
    const index = indexSources(
      files,
      files.map((f) => f.path),
    );
    expect(index.targets).toHaveLength(1);
    expect(index.targets[0].kind).toBe("file");
    expect(index.targets[0].unresolved).toContain(
      "Imports not statically inspected: parser.rb",
    );
    expect(index.skipped.map((s) => s.reason)).toEqual([
      "parse_error",
      "incomplete_file",
    ]);
  });
  it("keeps target identity stable across wording, line movement and source revisions", () => {
    const ambient = indexSources(
      [
        {
          path: "ambient.ts",
          content: "export declare class External { run(): void; }",
        },
      ],
      ["ambient.ts"],
    );
    expect(ambient.targets.every((t) => t.kind === "file")).toBe(true);
    const a = indexSources(
      [{ path: "x.ts", content: "export function parse() { return 1; }" }],
      ["x.ts"],
    );
    const b = indexSources(
      [
        {
          path: "x.ts",
          content: "// moved\nexport function parse() { return 2; }",
        },
      ],
      ["x.ts"],
    );
    expect(a.targets[0].id).toBe(b.targets[0].id);
    expect(a.references[0].sha256).not.toBe(b.references[0].sha256);
    expect(a.targets[0].reference_id).not.toBe(b.targets[0].reference_id);
  });
  it("does not send partial declarations when the evidence allowance is too small", () => {
    const index = indexSources(
      [
        {
          path: "x.ts",
          content:
            "export function large() { return '" + "x".repeat(3000) + "'; }",
        },
      ],
      ["x.ts"],
    );
    expect(evidencePacket(index, 300).targets).toEqual([]);
    expect(evidencePacket(index, 300).omitted_targets).toBe(1);
  });
  it("does not resolve escaping imports or unsupported paths into source facts", () => {
    const index = indexSources(
      [
        { path: "../escape.ts", content: "export const x = 1;" },
        {
          path: "a.ts",
          content: 'import x from "../escape"; export const a = x;',
        },
      ],
      ["../escape.ts", "a.ts"],
    );
    expect(index.targets).toHaveLength(1);
    expect(index.targets[0].unresolved).toEqual(["a.ts: ../escape"]);
  });
});
