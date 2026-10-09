import { beforeAll, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { componentId } from "@/lib/components";

const fixtures = vi.hoisted(() => ({
  public: true,
  model: vi.fn(),
  clientOptions: vi.fn(),
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
    constructor(options: unknown) {
      fixtures.clientOptions(options);
    }
    messages = { create: fixtures.model };
  },
}));
vi.mock("@/lib/github", () => ({
  getOwnedPublicRepo: async () => ({
    id: 7,
    name: "parser",
    full_name: "author/parser",
    html_url: "https://github.com/author/parser",
    owner: { id: 42, login: "author" },
    license: { spdx_id: "MIT" },
    language: "TypeScript",
    stargazers_count: 0,
    forks_count: 0,
  }),
  resolveSourceCommit: async () => "a".repeat(40),
  lastHumanCommit: async () => "2026-10-01T00:00:00Z",
  indexedSnapshotRepo: async () => ({
    sourceSha: "a".repeat(40),
    tree: ["src/parser.ts", "tests/parser.test.ts"],
    knownPaths: ["src/parser.ts", "tests/parser.test.ts"],
    files: [
      {
        path: "src/parser.ts",
        truncated: true,
        content:
          "export function parse(text: string) { return text.split(','); }",
      },
    ],
  }),
  verifiedPublicRepo: async () =>
    fixtures.public
      ? {
          name: "parser",
          full_name: "author/parser",
          html_url: "https://github.com/author/parser",
          owner: { login: "author" },
        }
      : null,
  isPublicRepoFresh: async () => fixtures.public,
}));

let db: typeof import("@/lib/db");
let actions: typeof import("@/app/dashboard/actions");
let exportRoute: typeof import("@/app/api/listings/[id]/parts/[part]/route");
let reportRoute: typeof import("@/app/api/listings/[id]/report/route");
let Home: typeof import("@/app/page").default;
beforeAll(async () => {
  vi.stubEnv("ANTHROPIC_API_KEY", "test-only");
  vi.stubEnv("ANTHROPIC_WORKSPACE_ID", "wrkspc_test");
  process.env.DATABASE_PATH = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "salvage-flow-")),
    "flow.db",
  );
  fixtures.model.mockResolvedValue({
    model: "mock-provider",
    stop_reason: "end_turn",
    usage: { input_tokens: 1000, output_tokens: 500 },
    content: [
      {
        type: "text",
        text: JSON.stringify({
          overview: "A parser project",
          languages: ["TypeScript"],
          frameworks: [],
          reusable_pieces: [
            {
              name: "Row parser",
              path: "src/parser.ts",
              description: "Parses rows",
              category: "Data processing",
              dependencies: ["JavaScript runtime"],
              related_paths: [],
              test_paths: ["tests/parser.test.ts"],
              integration_notes: "Extract the function and test row splitting.",
              limitations: ["Does not handle escaped delimiters"],
            },
          ],
        }),
      },
    ],
  });
  db = await import("@/lib/db");
  actions = await import("@/app/dashboard/actions");
  exportRoute = await import("@/app/api/listings/[id]/parts/[part]/route");
  reportRoute = await import("@/app/api/listings/[id]/report/route");
  Home = (await import("@/app/page")).default;
});

describe("listing to consumer brief with real SQLite persistence and mocked external boundaries", () => {
  it("publishes sampled evidence, renders component search, records review and exports the same source version", async () => {
    const form = new FormData();
    form.set("repoId", "7");
    form.set("note", "The parser is useful.");
    expect(await actions.salvage(null, form)).toHaveProperty("ok");
    const listing = db.allListings()[0];
    const piece = listing.summary.reusable_pieces[0];
    const part = componentId(piece);
    expect(piece).toMatchObject({
      source_sampled: true,
      test_paths: ["tests/parser.test.ts"],
    });
    expect(listing.summary.source_files).toEqual([
      { path: "src/parser.ts", coverage: "prefix", sampled_characters: 63 },
    ]);
    expect(piece.limitations).toContain(
      "Only a prefix of the primary source file was analyzed. Inspect the complete file before extraction.",
    );
    expect(fixtures.clientOptions).toHaveBeenCalledWith({
      timeout: 120_000,
      maxRetries: 0,
      defaultHeaders: { "anthropic-workspace-id": "wrkspc_test" },
    });
    expect(fixtures.model.mock.calls[0][0]).toMatchObject({
      max_tokens: 8000,
      output_config: { format: { type: "json_schema" } },
    });
    expect(fixtures.model.mock.calls[0][0]).not.toHaveProperty("fallbacks");
    const html = renderToStaticMarkup(
      await Home({
        searchParams: Promise.resolve({
          q: "row parser",
          language: "TypeScript",
        }),
      }),
    );
    expect(html).toContain("1 matching part");
    expect(html).toContain(`/listing/${listing.id}/parts/${part}`);
    const review = new FormData();
    for (const [key, value] of Object.entries({
      listingId: String(listing.id),
      partId: part,
      sourceSha: listing.source_sha!,
      analyzedAt: listing.analyzed_at!,
      reviewed: "true",
    }))
      review.set(key, value);
    expect(await actions.setComponentReview(null, review)).toHaveProperty("ok");
    const response = await exportRoute.GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: String(listing.id), part }),
    });
    const brief = await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(brief.source_commit).toBe(listing.source_sha);
    expect(brief.evidence.owner_reviewed_at).toBeTruthy();
    expect(brief.evidence.independently_tested).toBe(false);
  });
  it("records bounded reports and suppresses both search and export after operator hiding", async () => {
    const listing = db.allListings()[0];
    const part = componentId(listing.summary.reusable_pieces[0]);
    const context = { params: Promise.resolve({ id: String(listing.id) }) };
    const oversized = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ reason: "x".repeat(5000) }),
    });
    expect((await reportRoute.POST(oversized, context)).status).toBe(413);
    expect(
      (
        await reportRoute.POST(
          new Request("http://localhost", {
            method: "POST",
            body: JSON.stringify({ reason: "Check this license" }),
          }),
          context,
        )
      ).status,
    ).toBe(200);
    const report = db.moderationReports()[0];
    expect(report.reason).toBe("Check this license");
    expect(db.moderateReport(report.id, "hide")).toBe(true);
    expect(
      (
        await exportRoute.GET(new Request("http://localhost"), {
          params: Promise.resolve({ id: String(listing.id), part }),
        })
      ).status,
    ).toBe(404);
    expect(
      renderToStaticMarkup(
        await Home({ searchParams: Promise.resolve({ q: "row parser" }) }),
      ),
    ).toContain("0 matching parts");
    expect(db.moderateReport(report.id, "resolve")).toBe(false);
    expect(db.moderateReport(report.id, "restore")).toBe(true);
    expect(db.moderateReport(report.id, "resolve")).toBe(true);
  });
  it("removes public access when GitHub visibility fails while retaining owner removal controls", async () => {
    const listing = db.allListings()[0];
    fixtures.public = false;
    expect(
      (
        await exportRoute.GET(new Request("http://localhost"), {
          params: Promise.resolve({
            id: String(listing.id),
            part: componentId(listing.summary.reusable_pieces[0]),
          }),
        })
      ).status,
    ).toBe(404);
    const form = new FormData();
    form.set("id", String(listing.id));
    await actions.unlist(form);
    expect(db.getListing(listing.id)).toBeNull();
    expect(db.moderationReports()).toEqual([]);
  });
});

describe("deferred requests with real persistence", () => {
  const publishForm = () => {
    const form = new FormData();
    form.set("repoId", "7");
    return form;
  };
  it("does not resurrect a listing removed while the provider is still working", async () => {
    fixtures.public = true;
    expect(await actions.salvage(null, publishForm())).toHaveProperty("ok");
    const listing = db.allListings()[0];
    let resume!: (response: unknown) => void;
    let notifyStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      notifyStarted = resolve;
    });
    const result = await fixtures.model.mock.results[0].value;
    fixtures.model.mockImplementationOnce(() => {
      notifyStarted();
      return new Promise((resolve) => {
        resume = resolve;
      });
    });
    const pending = actions.salvage(null, publishForm());
    await started;
    const remove = new FormData();
    remove.set("id", String(listing.id));
    await actions.unlist(remove);
    resume(result);
    expect(await pending).toHaveProperty("error");
    expect(db.allListings()).toEqual([]);
    expect(db.db().prepare("SELECT * FROM active_analyses").all()).toEqual([]);
  });
  it("does not create an orphan report when its listing is removed during body upload", async () => {
    expect(await actions.salvage(null, publishForm())).toHaveProperty("ok");
    const listing = db.allListings()[0];
    let upload!: ReadableStreamDefaultController<Uint8Array>;
    let notifyRead!: () => void;
    const reading = new Promise<void>((resolve) => {
      notifyRead = resolve;
    });
    const body = new ReadableStream<Uint8Array>(
      {
        start(controller) {
          upload = controller;
        },
        pull() {
          notifyRead();
        },
      },
      { highWaterMark: 0 },
    );
    const request = new Request("http://localhost", {
      method: "POST",
      body,
      duplex: "half",
    } as RequestInit);
    const pending = reportRoute.POST(request, {
      params: Promise.resolve({ id: String(listing.id) }),
    });
    await reading;
    const remove = new FormData();
    remove.set("id", String(listing.id));
    await actions.unlist(remove);
    upload.enqueue(new TextEncoder().encode('{"reason":"Delayed report"}'));
    upload.close();
    expect((await pending).status).toBe(404);
    expect(db.moderationReports()).toEqual([]);
  });
});
