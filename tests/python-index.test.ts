import { beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
const state = vi.hoisted(() => ({ unavailable: false }));
vi.mock("node:child_process", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:child_process")>();
  return {
    ...original,
    spawnSync: (...args: Parameters<typeof original.spawnSync>) =>
      state.unavailable
        ? { status: null, error: new Error("missing parser") }
        : original.spawnSync(...args),
  };
});
import { indexSources, evidencePacket } from "@/lib/source-index";
beforeEach(() => {
  state.unavailable = false;
});
describe("Python AST source evidence", () => {
  it("supplies public declaration context before smaller private helper bodies within the same fixed budget", () => {
    const files = [
      {
        path: "private.py",
        content: "#" + "p".repeat(1800) + "\ndef _helper(x): return x\n",
      },
      {
        path: "public.py",
        content: "#" + "u".repeat(2500) + "\ndef transform(x): return x+1\n",
      },
    ];
    const index = indexSources(
      files,
      files.map((f) => f.path),
    );
    const old = evidencePacket(index, 4000, "repo-salvage/coverage-v2");
    const current = evidencePacket(index, 4000);
    expect(
      old.references.filter((r) => r.kind === "file").map((r) => r.path),
    ).toEqual(["private.py"]);
    expect(
      current.references.filter((r) => r.kind === "file").map((r) => r.path),
    ).toEqual(["public.py"]);
    expect(current.targets).toEqual(old.targets);
    expect(JSON.stringify(current).length).toBeLessThanOrEqual(4000);
    expect(current.references.find((r) => r.kind === "file")?.content).toBe(
      files[1].content,
    );
  });
  it("keeps non-Python context ahead of private-only Python declarations", () => {
    const files = [
      {
        path: "private.py",
        content: "#" + "p".repeat(1800) + "\ndef _helper(x): return x\n",
      },
      {
        path: "public.ts",
        content:
          "/*" +
          "t".repeat(2500) +
          "*/ export function transform(x: number) { return x+1; }",
      },
    ];
    const current = evidencePacket(
      indexSources(
        files,
        files.map((f) => f.path),
      ),
      4000,
    );
    expect(
      current.references.filter((r) => r.kind === "file").map((r) => r.path),
    ).toEqual(["public.ts"]);
  });
  it("gives public Python declarations an earlier bounded turn without deleting helper or method evidence", () => {
    const content =
      Array.from(
        { length: 30 },
        (_, i) => `def _helper${i}(): return ${i}`,
      ).join("\n") +
      "\nclass PublicCache:\n    def lookup(self, key):\n        return _helper0() if key else _helper1()\n";
    const index = indexSources([{ path: "cache.py", content }], ["cache.py"]);
    const prior = evidencePacket(index, undefined, "repo-salvage/coverage-v1");
    const current = evidencePacket(index);
    expect(prior.targets.some((t) => t.symbol === "PublicCache")).toBe(false);
    expect(current.selection_policy).toBe("repo-salvage/coverage-v3");
    expect(current.targets[0].symbol).toBe("PublicCache");
    expect(current.targets).toHaveLength(24);
    expect(index.targets.some((t) => t.symbol === "PublicCache.lookup")).toBe(
      true,
    );
    expect(
      current.references.some(
        (r) => r.kind === "file" && r.content === content,
      ),
    ).toBe(true);
  });
  it("keeps private-only Python implementations eligible", () => {
    const index = indexSources(
      [{ path: "helpers.py", content: "def _useful(x): return x + 1\n" }],
      ["helpers.py"],
    );
    expect(evidencePacket(index).targets.map((t) => t.symbol)).toEqual([
      "_useful",
    ]);
  });
  it("retains complete decorated functions and class methods with exact Unicode/BOM line ranges", () => {
    const content =
      '\ufeff# 😀\n@(\n    decorator("é")\n)\nasync def café(x):\n    return x\n\nclass Service:\n    @staticmethod\n    def twice(x):\n        return x * 2\n';
    const index = indexSources(
      [{ path: "service.py", content }],
      ["service.py"],
    );
    expect(index.files[0].parser).toBe("python");
    const fn = index.targets.find((t) => t.symbol === "café")!;
    const ref = index.references.find((r) => r.id === fn.reference_id)!;
    expect(ref.content).toBe(
      '@(\n    decorator("é")\n)\nasync def café(x):\n    return x',
    );
    expect([ref.start_line, ref.end_line]).toEqual([2, 6]);
    const method = index.targets.find((t) => t.symbol === "Service.twice")!;
    expect(
      index.references.find((r) => r.id === method.reference_id)?.content,
    ).toBe("@staticmethod\n    def twice(x):\n        return x * 2");
    expect(method.unresolved).toContain(
      "Enclosing Python class context required: Service",
    );
    expect(evidencePacket(index).targets.some((t) => t.id === method.id)).toBe(
      true,
    );
  });
  it("resolves package-relative and unique root/src imports transitively, records dynamic/ambiguous gaps and observes test linkage", () => {
    const files = [
      {
        path: "pkg/parser.py",
        content:
          "from .helper import trim\nimport math\ndef parse(x):\n    return trim(x)\n",
      },
      {
        path: "pkg/helper.py",
        content:
          "from .deep import value\ndef trim(x):\n    return x.strip()\n",
      },
      { path: "pkg/deep.py", content: "value = 1\n" },
      {
        path: "tests/test_parser.py",
        content: 'from pkg.parser import parse\nassert parse(" a ") == "a"\n',
      },
      {
        path: "client.py",
        content:
          "from library.util import value\nimport duplicate\nimportlib.import_module(name)\ndef get():\n    return value\n",
      },
      { path: "src/library/util.py", content: "value = 2\n" },
      { path: "duplicate.py", content: "x = 1" },
      { path: "src/duplicate.py", content: "x = 2" },
    ];
    const index = indexSources(
      files,
      files.map((f) => f.path),
    );
    const parser = index.targets.find((t) => t.symbol === "parse")!;
    expect(parser.supporting_paths).toEqual(["pkg/deep.py", "pkg/helper.py"]);
    expect(parser.unresolved).toEqual([]);
    expect(parser.test_paths).toEqual(["tests/test_parser.py"]);
    expect(parser.imports).toContainEqual({
      specifier: "math",
      kind: "external",
      resolved_path: null,
    });
    const client = index.targets.find((t) => t.symbol === "get")!;
    expect(client.supporting_paths).toEqual(["src/library/util.py"]);
    expect(client.unresolved).toEqual([
      "client.py: <dynamic Python import>",
      "client.py: duplicate",
    ]);
  });
  it("withholds declarations for invalid/newer grammar, incompatible encoding and prefixes, and reports a missing parser conservatively", () => {
    const files = [
      { path: "bad.py", content: "def broken(:" },
      { path: "new.py", content: "type Alias = int\ndef use(x): return x" },
      { path: "latin.py", content: "# coding: latin-1\ndef café(): return 1" },
      { path: "cut.py", content: "def cut(): return 1", truncated: true },
    ];
    expect(
      indexSources(
        files,
        files.map((f) => f.path),
      ).targets,
    ).toEqual([]);
    state.unavailable = true;
    const index = indexSources(
      [{ path: "x.py", content: "def parse(x): return x" }],
      ["x.py"],
    );
    expect(index.targets[0].kind).toBe("file");
    expect(index.targets[0].unresolved).toEqual([
      "Imports not statically inspected: x.py",
    ]);
    expect(index.skipped).toContainEqual({
      path: "x.py",
      reason: "python_parser_unavailable",
    });
  });
  it("never executes source-level file writes, decorators or import calls while parsing", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "salvage-python-data-")),
      sentinel = path.join(dir, "executed");
    try {
      const content = `open(${JSON.stringify(sentinel)}, "w").write("executed")\n@__import__("os").system("false")\ndef parse(x): return x\n`;
      const index = indexSources(
        [{ path: "source.py", content }],
        ["source.py"],
      );
      expect(index.targets.find((t) => t.symbol === "parse")?.kind).toBe(
        "declaration",
      );
      expect(fs.existsSync(sentinel)).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
  it("finds a tail declaration, resolves repeated bindings to the last definition and validates an authored extraction in a fresh consumer", () => {
    const content =
      "#" +
      "x".repeat(7000) +
      "\ndef clamp(value,low,high): return 0\ndef clamp(value,low,high):\n    return max(low,min(high,value))\n";
    const index = indexSources([{ path: "clamp.py", content }], ["clamp.py"]);
    const targets = index.targets.filter((t) => t.symbol === "clamp");
    expect(targets).toHaveLength(1);
    const reference = index.references.find(
      (r) => r.id === targets[0].reference_id,
    )!;
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), "salvage-python-consumer-"),
    );
    try {
      fs.writeFileSync(
        path.join(dir, "consumer.py"),
        reference.content +
          "\nassert clamp(-1,0,10)==0\nassert clamp(11,0,10)==10\nassert clamp(5,0,10)==5\n",
      );
      const result = spawnSync("python3", ["-I", "-S", "consumer.py"], {
        cwd: dir,
        encoding: "utf8",
        timeout: 5000,
        env: { PATH: process.env.PATH, NODE_ENV: process.env.NODE_ENV },
      });
      expect(result.status, result.stderr).toBe(0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
  it("does not retain methods from a replaced class binding", () => {
    const content =
      "class Service:\n    def stale(self): return 1\nclass Service:\n    def current(self): return 2\n";
    const index = indexSources(
      [{ path: "service.py", content }],
      ["service.py"],
    );
    expect(index.targets.map((t) => t.symbol)).toEqual([
      "Service",
      "Service.current",
    ]);
  });
  it("keeps Unicode separators inside comments and recognizes CR/CRLF source lines", () => {
    for (const newline of ["\n", "\r", "\r\n"]) {
      const content = `# Unicode \u2028 separator${newline}def twice(x):${newline}    return x * 2${newline}`;
      const index = indexSources([{ path: "twice.py", content }], ["twice.py"]);
      const target = index.targets.find((t) => t.symbol === "twice")!;
      const reference = index.references.find(
        (r) => r.id === target.reference_id,
      )!;
      expect(reference.content).toBe(`def twice(x):${newline}    return x * 2`);
      expect([reference.start_line, reference.end_line]).toEqual([2, 3]);
    }
  });
});
