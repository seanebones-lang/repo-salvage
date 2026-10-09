import { beforeAll, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PartDetail } from "@/components/part-detail";
import { componentId } from "@/lib/components";

const state = vi.hoisted(() => ({
  outcome: "candidates",
  forged: false,
  requests: 0,
}));
vi.mock("@/auth", () => ({
  getSession: async () => ({
    ghId: 42,
    login: "author",
    accessToken: "test-only",
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = {
      create: async (request: { messages: { content: string }[] }) => {
        state.requests++;
        const data = JSON.parse(request.messages[0].content);
        const target = data.evidence.targets.find(
          (t: { symbol: string }) => t.symbol === "parse",
        );
        return {
          model: "fixture-provider",
          stop_reason: "end_turn",
          usage: {},
          content: [
            {
              type: "text",
              text: JSON.stringify({
                overview: "A row parser",
                outcome: state.outcome,
                reusable_pieces:
                  state.outcome === "no_candidates"
                    ? []
                    : [
                        {
                          target_id: target.id,
                          name: "Row parser",
                          description: "Splits a row",
                          category: "Data processing",
                          integration_notes:
                            "Inspect the source and test delimiter behavior.",
                          limitations: [],
                          explanation_refs: [
                            state.forged ? "forged" : target.reference_id,
                          ],
                        },
                      ],
              }),
            },
          ],
        };
      },
    };
  },
}));
let db: typeof import("@/lib/db");
let actions: typeof import("@/app/dashboard/actions");
const sha = "a".repeat(40);
const source =
  "/*" +
  "x".repeat(8000) +
  "*/\nexport function parse(text: string) { return text.split(','); }";
beforeAll(async () => {
  vi.stubEnv(
    "DATABASE_PATH",
    path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), "salvage-indexed-flow-")),
      "flow.db",
    ),
  );
  vi.stubEnv("ANTHROPIC_API_KEY", "fake-offline-only");
  vi.stubEnv("DAILY_SUMMARY_LIMIT", "10");
  vi.stubEnv("GLOBAL_DAILY_SUMMARY_LIMIT", "10");
  const repo = {
    id: 70,
    name: "parser",
    full_name: "author/parser",
    html_url: "https://github.com/author/parser",
    owner: { id: 42, login: "author" },
    license: { spdx_id: "MIT" },
    language: "TypeScript",
    stargazers_count: 0,
    forks_count: 0,
    private: false,
    fork: false,
    default_branch: "main",
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("raw.githubusercontent.com"))
        return new Response(source);
      if (url.includes("/git/trees/"))
        return new Response(
          JSON.stringify({
            tree: [
              {
                path: "src/parser.ts",
                mode: "100644",
                type: "blob",
                size: Buffer.byteLength(source),
                sha: createHash("sha1")
                  .update(`blob ${Buffer.byteLength(source)}\0`)
                  .update(source)
                  .digest("hex"),
              },
            ],
          }),
        );
      if (url.includes("/commits/main"))
        return new Response(JSON.stringify({ sha }));
      if (url.includes("/commits?")) return new Response("[]");
      return new Response(JSON.stringify(repo));
    }),
  );
  db = await import("@/lib/db");
  actions = await import("@/app/dashboard/actions");
});
const form = () => {
  const data = new FormData();
  data.set("repoId", "70");
  return data;
};
describe("indexed publication to consumer flow with real SQLite and mocked external transport", () => {
  it("publishes a complete tail declaration, exposes its evidence in the page and retains the prior listing on rejected output", async () => {
    expect(await actions.salvage(null, form())).toEqual({
      ok: "Listed author/parser",
    });
    const listing = db.allListings()[0];
    const piece = listing.summary.reusable_pieces[0];
    expect(piece.source_target?.symbol).toBe("parse");
    expect(piece.source_target?.reference.start_line).toBe(2);
    expect(listing.summary.analysis?.format).toBe("repo-salvage/analysis-v2");
    const html = renderToStaticMarkup(
      <PartDetail listing={listing} piece={piece} />,
    );
    expect(html).toContain("Complete declaration inspected");
    expect(html).toContain("model interpretation");
    db.reviewComponent(
      listing.id,
      42,
      componentId(piece),
      sha,
      listing.analyzed_at!,
      true,
    );
    const reviewed = db.getListing(listing.id)!;
    state.forged = true;
    expect((await actions.salvage(null, form()))?.error).toMatch(
      /references unavailable/,
    );
    expect(db.getListing(listing.id)).toEqual(reviewed);
    state.forged = false;
    state.outcome = "no_candidates";
    expect((await actions.salvage(null, form()))?.ok).toContain(
      "no suitable components",
    );
    expect(db.getListing(listing.id)?.summary.reusable_pieces).toEqual([]);
    expect(db.analysisHistory(listing.id, 42)).toHaveLength(3);
    expect(state.requests).toBe(3);
  });
});
