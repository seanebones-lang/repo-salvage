import { describe, expect, it, vi } from "vitest";
import { indexSources, evidencePacket } from "@/lib/source-index";
import {
  verifiedIndexedSummary,
  summarizeRepo,
  indexedAnalysisRequest,
} from "@/lib/summarize";
import { componentId, filterComponents } from "@/lib/components";
import { inspectionResponse, searchResponse } from "@/lib/agent-api";
import type { GhRepo } from "@/lib/github";
import type { Listing } from "@/lib/db";
import Ajv from "ajv";
import contract from "../public/openapi.json";

const files = [
  {
    path: "src/parser.ts",
    content:
      'import { trim } from "./helper"; export function parse(x: string) { return trim(x); }',
  },
  {
    path: "src/helper.ts",
    content:
      'import fs from "node:fs"; export const trim = (x: string) => x.trim();',
  },
  { path: "LICENSE", content: "MIT" },
];
const index = indexSources(
  files,
  files.map((f) => f.path),
);
const packet = evidencePacket(index);
const target = packet.targets.find((t) => t.symbol === "parse")!;
const response = (over: Record<string, unknown> = {}) => ({
  overview: "A parser",
  outcome: "candidates",
  reusable_pieces: [
    {
      target_id: target.id,
      name: "Row parser",
      description: "Trims text",
      category: "Data processing",
      integration_notes: "Inspect trim and add a consumer test.",
      limitations: [],
      explanation_refs: [target.reference_id],
      path: "forged.ts",
      dependencies: ["invented"],
      source_target: { kind: "verified" },
      owner_reviewed_at: "forged",
      ...over,
    },
  ],
});
const repo = { full_name: "author/parser" } as GhRepo;
const listing = (summary: Listing["summary"]): Listing => ({
  id: 1,
  github_repo_id: 7,
  owner_id: 42,
  owner_login: "author",
  full_name: "author/parser",
  name: "parser",
  url: "https://github.com/author/parser",
  source_sha: "a".repeat(40),
  analyzed_at: "2026-10-09",
  summary_model: "test",
  summary,
  description: null,
  language: "TypeScript",
  stars: 0,
  forks: 0,
  license: "MIT",
  last_human_commit: null,
  owner_note: null,
  used_count: 0,
  created_at: "now",
});

describe("indexed analysis boundary", () => {
  it("attaches a server-observed context gap even when the generated explanation omits it", () => {
    const inputs = [
      {
        path: "x.ts",
        content:
          "/*" +
          "x".repeat(10000) +
          "*/ export function take() { return helper(); } function helper() { return 1; }",
      },
    ];
    const indexed = indexSources(inputs, ["x.ts"]);
    const bounded = evidencePacket(indexed, 2000);
    const chosen = bounded.targets[0];
    const summary = verifiedIndexedSummary(
      JSON.stringify({
        overview: "One helper",
        outcome: "candidates",
        reusable_pieces: [
          {
            target_id: chosen.id,
            name: "take",
            description: "Calls helper",
            category: "Data processing",
            integration_notes: "Inspect surrounding code.",
            limitations: [],
            explanation_refs: [chosen.reference_id],
          },
        ],
      }),
      indexed,
      bounded,
    );
    expect(summary.reusable_pieces[0].limitations?.join(" ")).toContain(
      "Same-file context was omitted",
    );
    expect(summary.analysis?.index.selection_policy).toBe(
      "repo-salvage/coverage-v2",
    );
  });
  it("attaches source identity, observed transitive imports and evidence independently of model claims", () => {
    const summary = verifiedIndexedSummary(
      JSON.stringify(response()),
      index,
      packet,
    );
    const piece = summary.reusable_pieces[0];
    expect(piece.path).toBe("src/parser.ts");
    expect(piece.dependencies).toEqual(["node:fs"]);
    expect(piece.related_paths).toEqual(["src/helper.ts"]);
    expect(piece.source_target?.reference.start_line).toBe(1);
    expect(piece).not.toHaveProperty("owner_reviewed_at");
    expect(componentId(piece)).toBe(
      componentId({ ...piece, name: "Different wording" }),
    );
    expect(summary.analysis?.index.references).not.toHaveProperty("content");
  });
  it("rejects hallucinated targets/references, missing primary citations and duplicate recommendations", () => {
    for (const over of [
      { target_id: "a".repeat(16) },
      { explanation_refs: ["invented"] },
      { explanation_refs: [] },
      { category: "invented" },
      { name: "https://example.com" },
    ])
      expect(() =>
        verifiedIndexedSummary(JSON.stringify(response(over)), index, packet),
      ).toThrow();
    const duplicated = response();
    duplicated.reusable_pieces.push(duplicated.reusable_pieces[0]);
    expect(() =>
      verifiedIndexedSummary(JSON.stringify(duplicated), index, packet),
    ).toThrow(/duplicate/);
  });
  it("accepts an explicit no-candidate result and rejects invalid output disguised as an empty success", () => {
    const empty = verifiedIndexedSummary(
      JSON.stringify({
        overview: "No useful extraction found.",
        outcome: "no_candidates",
        reusable_pieces: [],
      }),
      index,
      packet,
    );
    expect(empty.analysis?.outcome).toBe("no_candidates");
    expect(empty.reusable_pieces).toEqual([]);
    expect(() =>
      verifiedIndexedSummary(
        JSON.stringify({
          overview: "No useful extraction",
          outcome: "candidates",
          reusable_pieces: [],
        }),
        index,
        packet,
      ),
    ).toThrow();
    expect(() =>
      verifiedIndexedSummary(
        JSON.stringify({ ...response(), outcome: "no_candidates" }),
        index,
        packet,
      ),
    ).toThrow();
  });
  it("uses a replaceable bounded provider, never supplies credentials and does not retry incomplete output", async () => {
    const generate = vi.fn(
      async (_request: ReturnType<typeof indexedAnalysisRequest>) => ({
        text: JSON.stringify(response()),
        model: "fixture-provider",
        requestId: "fixture",
        usage: {},
        stopReason: "end_turn",
      }),
    );
    const snapshot = {
      sourceSha: "a".repeat(40),
      files,
      knownPaths: files.map((f) => f.path),
      tree: [],
      index,
      packet,
    };
    const result = await summarizeRepo(repo, snapshot, "Public owner note", {
      generate,
    });
    expect(result.model).toBe("fixture-provider");
    expect(generate).toHaveBeenCalledTimes(1);
    const request = generate.mock.calls[0][0] as unknown as ReturnType<
      typeof indexedAnalysisRequest
    >;
    expect(request.maxOutputTokens).toBe(4000);
    expect(request.input).not.toMatch(/accessToken|API_KEY/);
    generate.mockResolvedValueOnce({
      text: JSON.stringify(response()),
      model: "fixture-provider",
      requestId: "fixture",
      usage: {},
      stopReason: "max_tokens",
    });
    await expect(
      summarizeRepo(repo, snapshot, null, { generate }),
    ).rejects.toThrow(/did not complete/);
    expect(generate).toHaveBeenCalledTimes(2);
  });
  it("makes no provider call when no complete target can fit the evidence allowance", async () => {
    const emptyIndex = indexSources(
      [{ path: "README.md", content: "Documentation only" }],
      ["README.md"],
    );
    const generate = vi.fn();
    const result = await summarizeRepo(
      repo,
      {
        files: [],
        knownPaths: [],
        tree: [],
        sourceSha: "a".repeat(40),
        index: emptyIndex,
        packet: evidencePacket(emptyIndex),
      },
      null,
      { generate },
    );
    expect(generate).not.toHaveBeenCalled();
    expect(result.summary.analysis?.outcome).toBe("no_candidates");
  });
  it("exports the same facts through search/inspection contracts and filters on observed source coverage", () => {
    const summary = verifiedIndexedSummary(
      JSON.stringify(response()),
      index,
      packet,
    );
    const record = listing(summary);
    const piece = summary.reusable_pieces[0];
    const tree = files.map((f) => ({
      path: f.path,
      type: "blob",
      mode: "100644",
      sha: "a".repeat(40),
    }));
    const inspected = inspectionResponse(
      record,
      piece,
      componentId(piece),
      tree,
      2,
    );
    const ajv = new Ajv({ strict: false });
    const check = ajv.compile(contract.components.schemas.PartV2);
    expect(check(inspected), JSON.stringify(check.errors)).toBe(true);
    expect(inspected.evidence.declaration_coverage).toBe("complete");
    expect(inspected.evidence.independently_tested).toBe(false);
    const legacyInspection = inspectionResponse(
      record,
      piece,
      componentId(piece),
      tree,
    );
    const checkLegacy = ajv.compile(contract.components.schemas.Part);
    expect(
      checkLegacy(legacyInspection),
      JSON.stringify(checkLegacy.errors),
    ).toBe(true);
    expect(legacyInspection.evidence).not.toHaveProperty("source_target");
    const checkLegacySearch = ajv.compile(contract.components.schemas.Search);
    const legacySearch = searchResponse([record], new URLSearchParams());
    expect(
      checkLegacySearch(legacySearch),
      JSON.stringify(checkLegacySearch.errors),
    ).toBe(true);
    const result = searchResponse(
      [record],
      new URLSearchParams("declaration=complete&imports=resolved"),
      2,
    );
    const checkSearch = ajv.compile(contract.components.schemas.SearchV2);
    expect(checkSearch(result), JSON.stringify(checkSearch.errors)).toBe(true);
    expect(result.pagination.total).toBe(1);
    const legacy = {
      listing: record,
      id: "legacy",
      piece: { path: "legacy.py", name: "Legacy", description: "Legacy" },
    };
    expect(filterComponents([legacy], { declaration: "complete" })).toEqual([]);
  });
});
