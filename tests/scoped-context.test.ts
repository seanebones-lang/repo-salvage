import { describe, it, expect } from "vitest";
import { indexSources, evidencePacket, indexRecord } from "@/lib/source-index";
import {
  indexedAnalysisRequest,
  verifiedIndexedSummary,
} from "@/lib/summarize";
import type { GhRepo } from "@/lib/github";
const build = (source: string, symbol: string, limit = 6000) => {
  const index = indexSources(
    [{ path: "large.py", content: source }],
    ["large.py"],
  );
  const target = index.targets.find((t) => t.symbol === symbol)!;
  expect(target).toBeTruthy();
  const packet = evidencePacket({ ...index, targets: [target] }, limit);
  return { index, target, packet, scope: packet.scoped_contexts?.[0] };
};
const padding = "#" + "x".repeat(15000) + "\n";
describe("bounded Python supporting statements", () => {
  it("preserves complete-file locators when an import or assignment occupies the entire module", () => {
    for (const content of ["import math", "VALUE = 1"]) {
      const index = indexSources(
        [{ path: "single.py", content }],
        ["single.py"],
      );
      expect(index.references).toHaveLength(1);
      for (const policy of [
        "repo-salvage/coverage-v1",
        "repo-salvage/coverage-v2",
        "repo-salvage/coverage-v3",
        "repo-salvage/coverage-v4",
      ] as const) {
        const packet = evidencePacket(index, 2000, policy);
        expect(packet.targets[0].kind).toBe("file");
        expect(packet.references[0].kind).toBe("file");
        expect(packet.references[0].content).toBe(content);
        expect(packet.contexts![0].same_file_reference).toBe(
          packet.references[0].id,
        );
      }
    }
  });
  it("supplies complete imports, constants and transitive helpers without declaring full module context", () => {
    const source =
      padding +
      "from decimal import Decimal as D\nSCALE = D('2.5')\ndef helper(x): return x * SCALE\ndef transform(x): return helper(D(x))\n";
    const { index, target, packet, scope } = build(source, "transform");
    expect(packet.contexts?.[0].same_file_reference).toBeNull();
    expect(scope?.references.map((r) => r.symbol).sort()).toEqual([
      "D",
      "SCALE",
      "helper",
    ]);
    expect(scope?.gaps).toEqual([]);
    expect(
      packet.references
        .filter((r) => r.kind === "statement")
        .map((r) => r.content),
    ).toEqual(["from decimal import Decimal as D", "SCALE = D('2.5')"]);
    for (const r of packet.references) expect(source).toContain(r.content);
    expect(JSON.stringify(packet).length).toBeLessThanOrEqual(6000);
    const old = evidencePacket(
      { ...index, targets: [target] },
      6000,
      "repo-salvage/coverage-v3",
    );
    expect(old.scoped_contexts).toBeUndefined();
    expect(old.references).toHaveLength(1);
    const record = indexRecord(index, packet);
    expect(record.scoped_contexts).toEqual(packet.scoped_contexts);
    expect(record.references.every((r) => !("content" in r))).toBe(true);
  });
  it("keeps decorated member blocks whole when a supporting class exceeds the allowance", () => {
    const source =
      padding +
      'class Job:\n    """' +
      "d".repeat(9000) +
      '\n    """\n    def __init__(self, value):\n        self.value = value\n    @property\n    def run(self):\n        return self.value\ndef make(): return Job(1).run\n';
    const { packet, scope } = build(source, "make");
    expect(scope?.gaps).toContainEqual({
      symbol: "Job",
      reason: "packet-budget",
    });
    expect(scope?.references.map((r) => r.symbol)).toEqual([
      "Job.__init__",
      "Job.run",
    ]);
    const run = packet.references.find((r) =>
      r.content.startsWith("@property"),
    )!;
    expect(run.content).toBe(
      "@property\n    def run(self):\n        return self.value",
    );
    expect(
      scope?.references.every((r) => r.relation === "class-member-spelling"),
    ).toBe(true);
    expect(packet.contexts?.[0].same_file_reference).toBeNull();
  });
  it("reports conditional, repeated, deleted, annotation-only and wildcard bindings instead of asserting resolution", () => {
    const source =
      padding +
      "from other import *\nVALUE = 1\nVALUE = 2\nif enabled:\n    def conditional(): return 3\nOLD = 4\ndel OLD\nONLY: int\ndef read(): return VALUE, conditional(), OLD, ONLY\n";
    const { scope } = build(source, "read");
    for (const symbol of ["VALUE", "conditional", "OLD"])
      expect(scope?.gaps).toContainEqual({
        symbol,
        reason: "ambiguous-or-conditional-binding",
      });
    expect(scope?.gaps).toContainEqual({
      symbol: "ONLY",
      reason: "annotation-only-binding",
    });
    expect(scope?.gaps).toContainEqual({
      symbol: "*",
      reason: "wildcard-import",
    });
    expect(scope?.references).toEqual([]);
  });
  it("preserves Unicode, BOM, CRLF and future-import statements as exact source evidence", () => {
    const source =
      "\ufeff" +
      padding.replaceAll("\n", "\r\n") +
      "from __future__ import annotations\r\nCONSTANT = 'é😀'\r\ndef helper():\r\n    return CONSTANT\r\ndef use(): return helper()\r\n";
    const { packet, scope } = build(source, "use");
    expect(
      scope?.references.some((r) => r.relation === "module-configuration"),
    ).toBe(true);
    const constant = packet.references.find((r) =>
      r.content.startsWith("CONSTANT"),
    )!;
    expect(constant.content).toBe("CONSTANT = 'é😀'");
    expect([constant.start_line, constant.end_line]).toEqual([3, 3]);
    expect(
      packet.references.find((r) => r.content.startsWith("def helper"))
        ?.content,
    ).toBe("def helper():\r\n    return CONSTANT");
  });
  it("excludes explicit function locals without dropping enclosing-scope defaults or comprehension-external loads", () => {
    const { scope } = build(
      padding +
        "VALUE = 3\nitems = [local for local in range(3)]\ndef use(VALUE): return VALUE, local\n",
      "use",
    );
    expect(scope?.references).toEqual([]);
    expect(
      build(
        padding + "VALUE = 3\ndef use(VALUE=VALUE): return VALUE\n",
        "use",
      ).scope?.references.map((r) => r.symbol),
    ).toEqual(["VALUE"]);
    expect(
      build(
        padding +
          "VALUE = 3\ndef use(): return [VALUE for VALUE in range(3)], VALUE\n",
        "use",
      ).scope?.references.map((r) => r.symbol),
    ).toEqual(["VALUE"]);
    expect(scope?.observation).toBe("python-ast-name-loads-v1");
  });
  it("bounds cycles and high fan-out and obeys small serialized allowances without clipping source", () => {
    const source =
      padding +
      Array.from({ length: 40 }, (_, i) => `N${i} = ${i}`).join("\n") +
      "\ndef left(): return right()\ndef right(): return left()\ndef all_names(): return " +
      Array.from({ length: 40 }, (_, i) => `N${i}`).join(",") +
      "\n";
    const fanout = build(source, "all_names", 9000);
    expect(fanout.scope?.observations_omitted).toBeGreaterThan(0);
    expect(fanout.scope!.references.length).toBeLessThanOrEqual(16);
    expect(
      build(source, "left").scope?.references.map((r) => r.symbol),
    ).toEqual(["right"]);
    for (const limit of [1000, 1400, 1800, 2200, 3500]) {
      const { packet } = build(source, "left", limit);
      expect(JSON.stringify(packet).length).toBeLessThanOrEqual(limit);
      for (const ref of packet.references)
        expect(source).toContain(ref.content);
      for (const c of packet.scoped_contexts ?? [])
        for (const ref of c.references)
          expect(packet.references.some((r) => r.id === ref.reference_id)).toBe(
            true,
          );
    }
  });
  it("retains server disclosures even when model prose omits scoped-evidence limitations", () => {
    const { index, target, packet } = build(
      padding + "HELPER = 1\ndef read(): return HELPER\n",
      "read",
    );
    const request = indexedAnalysisRequest(
      { full_name: "owner/repo" } as GhRepo,
      packet,
      null,
    );
    expect(request.system).toContain(
      "not resolved scopes, receiver types or a complete dependency closure",
    );
    const summary = verifiedIndexedSummary(
      JSON.stringify({
        overview: "Reads a constant.",
        outcome: "candidates",
        reusable_pieces: [
          {
            target_id: target.id,
            name: "Read",
            description: "Read the constant.",
            category: "Other",
            integration_notes: "Review context.",
            limitations: [],
            explanation_refs: [target.reference_id],
          },
        ],
      }),
      index,
      packet,
    );
    expect(
      summary.reusable_pieces[0].limitations?.some((l) =>
        l.startsWith("Scoped supporting blocks"),
      ),
    ).toBe(true);
    expect(
      summary.reusable_pieces[0].limitations?.some((l) =>
        l.startsWith("Same-file context was omitted"),
      ),
    ).toBe(true);
  });
});
