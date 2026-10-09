import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { exampleListing } from "@/lib/examples";
import { componentId } from "@/lib/components";
import { inspectionResponse } from "@/lib/agent-api";
import type { Listing } from "@/lib/db";
import type { SourceFile } from "@/lib/github";
import Ajv from "ajv/dist/2020";

const fixture = vi.hoisted(() => ({ status: vi.fn(), tree: vi.fn() }));
vi.mock("@/lib/github", () => ({
  publicRepoStatus: fixture.status,
  pinnedSourceTree: fixture.tree,
  verifiedPublicRepo: vi.fn(),
}));
let db: typeof import("@/lib/db");
let search: typeof import("@/app/api/v1/parts/route");
let inspect: typeof import("@/app/api/v1/parts/[id]/[part]/route");
const primary = "src/parser.ts";
const contract = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "public/openapi.json"), "utf8"),
);
const ajv = new Ajv({ strict: false });
const checkSearch = ajv.compile(contract.components.schemas.Search);
const checkPart = ajv.compile(contract.components.schemas.Part);
const sha = "a".repeat(40);
const tree: SourceFile[] = [
  primary,
  "src/helper.ts",
  "tests/parser.test.ts",
  "LICENSE",
  "LICENSES/MIT.txt",
].map((file) => ({ path: file, sha, mode: "100644", type: "blob", size: 10 }));
const record = (
  id: number,
): Omit<Listing, "id" | "used_count" | "created_at"> => ({
  ...exampleListing,
  github_repo_id: id,
  owner_id: 42,
  name: `repo${id}`,
  full_name: `author/repo${id}`,
  url: `https://github.com/author/repo${id}`,
  source_sha: sha,
  summary: {
    languages: ["TypeScript"],
    frameworks: [],
    overview: "Utilities",
    source_files: [
      { path: primary, coverage: "prefix", sampled_characters: 6000 },
    ],
    reusable_pieces: [
      {
        name: `Parser ${id}`,
        path: primary,
        description: "CSV row parser",
        category: "Data processing",
        dependencies: ["Node.js"],
        source_sampled: true,
        related_paths: ["src/helper.ts"],
        test_paths: ["tests/parser.test.ts"],
      },
    ],
  },
});
const request = (query = "") =>
  new Request(`http://localhost/api/v1/parts${query}`);
const context = (listing: Listing) => ({
  params: Promise.resolve({
    id: String(listing.id),
    part: componentId(listing.summary.reusable_pieces[0]),
  }),
});

beforeAll(async () => {
  process.env.DATABASE_PATH = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "salvage-agents-")),
    "test.db",
  );
  db = await import("@/lib/db");
  search = await import("@/app/api/v1/parts/route");
  inspect = await import("@/app/api/v1/parts/[id]/[part]/route");
});
afterAll(() => {
  vi.unstubAllEnvs();
  db.db().close();
});
beforeEach(() => {
  db.db().exec("DELETE FROM listings");
  db.db().exec("DELETE FROM request_limits");
  vi.stubEnv("AGENT_READ_LIMIT", "30");
  fixture.status.mockReset().mockImplementation(async (id: number) => ({
    status: "public",
    repo: {
      name: `repo${id}`,
      full_name: `author/repo${id}`,
      html_url: `https://github.com/author/repo${id}`,
      owner: { login: "author" },
    },
  }));
  fixture.tree.mockReset().mockResolvedValue(tree);
  for (const id of [1, 2, 3]) db.upsertListing(record(id));
});

describe("agent API with real SQLite and mocked GitHub", () => {
  it("bounds shared read traffic before upstream work", async () => {
    vi.stubEnv("AGENT_READ_LIMIT", "1");
    expect((await search.GET(request())).status).toBe(200);
    const calls = fixture.status.mock.calls.length;
    const response = await inspect.GET(request(), context(db.allListings()[0]));
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
    expect(fixture.status.mock.calls.length).toBe(calls);
    vi.stubEnv("AGENT_READ_LIMIT", "0");
    expect((await search.GET(request())).status).toBe(429);
    vi.stubEnv("AGENT_READ_LIMIT", "-1");
    expect((await search.GET(request())).status).toBe(503);
  });
  it("searches parts, exposes evidence and detects catalog changes across pages", async () => {
    const first = await search.GET(
      request(
        "?q=CSV%20parser&language=TypeScript&license=MIT&limit=1&sort=name",
      ),
    );
    const result = await first.json();
    expect(checkSearch(result), JSON.stringify(checkSearch.errors)).toBe(true);
    expect(first.headers.get("cache-control")).toContain("no-store");
    expect(result.pagination.total).toBe(3);
    expect(result.results[0]).toMatchObject({
      repository: "author/repo1",
      evidence: {
        primary_file_coverage: "prefix",
        component_license_status: "not_audited",
        independently_tested: false,
      },
    });
    const next = await search.GET(
      new Request(`http://localhost${result.pagination.next}`),
    );
    expect((await next.json()).results[0].repository).toBe("author/repo2");
    db.deleteListing(db.allListings()[0].id, 42);
    const changed = await search.GET(
      new Request(`http://localhost${result.pagination.next}`),
    );
    expect(changed.status).toBe(409);
    expect((await changed.json()).error.code).toBe("catalog_changed");
    expect(
      (await (await search.GET(request("?q=unmatched"))).json()).pagination
        .total,
    ).toBe(0);
  });

  it("rejects malformed, repeated and unknown parameters before GitHub work", async () => {
    for (const query of [
      "?limit=0",
      "?limit=51",
      "?page=1.5",
      "?page=100001",
      "?q=x&q=y",
      "?category=madeup",
      "?category=",
      "?sort=",
      "?sort=random",
      "?toString=x",
      "?q=" + "a".repeat(257),
      "?revision=bad",
    ]) {
      expect((await search.GET(request(query))).status).toBe(400);
    }
    expect(fixture.status).not.toHaveBeenCalled();
  });

  it("excludes hidden and inaccessible repositories and reports upstream failure as 503", async () => {
    db.db()
      .prepare(
        "UPDATE listings SET moderation_hidden_at='now' WHERE github_repo_id=1",
      )
      .run();
    fixture.status.mockImplementation(async (id: number) =>
      id === 2
        ? { status: "excluded" }
        : {
            status: "public",
            repo: {
              name: "repo3",
              full_name: "author/repo3",
              html_url: "https://github.com/author/repo3",
              owner: { login: "author" },
            },
          },
    );
    const result = await (await search.GET(request())).json();
    expect(
      result.results.map((entry: { repository: string }) => entry.repository),
    ).toEqual(["author/repo3"]);
    expect(result).not.toHaveProperty("hidden");
    fixture.status.mockResolvedValue({ status: "unavailable" });
    const unavailable = await search.GET(request());
    expect(unavailable.status).toBe(503);
    expect(unavailable.headers.get("retry-after")).toBe("60");
    expect(await unavailable.json()).not.toHaveProperty("results");
    expect(
      (await inspect.GET(request(), context(db.allListings()[0]))).status,
    ).toBe(503);
  });

  it("inspects pinned files, notices and actual coverage without certifying licenses or tests", async () => {
    const listing = db.allListings()[0];
    const response = await inspect.GET(request(), context(listing));
    const result = await response.json();
    expect(checkPart(result), JSON.stringify(checkPart.errors)).toBe(true);
    expect(response.status).toBe(200);
    expect(fixture.tree).toHaveBeenCalledWith(listing.full_name, sha);
    expect(
      result.files.find((file: { path: string }) => file.path === primary),
    ).toMatchObject({
      roles: ["primary"],
      analysis_coverage: "prefix",
      git_blob_sha: sha,
    });
    expect(
      result.files.find(
        (file: { path: string }) => file.path === "src/helper.ts",
      ).analysis_coverage,
    ).toBe("tree_only");
    expect(result.licensing).toMatchObject({
      component_license_status: "not_audited",
      notice_paths: ["LICENSE", "LICENSES/MIT.txt"],
      requires_manual_review: true,
    });
    const legacy = {
      ...listing,
      summary: { ...listing.summary, source_files: undefined },
    };
    expect(
      inspectionResponse(
        legacy,
        legacy.summary.reusable_pieces[0],
        "b".repeat(16),
        tree,
      ).files[0].analysis_coverage,
    ).toBe("sampled_extent_unknown");
    const vendored = {
      ...listing.summary.reusable_pieces[0],
      path: "third-party/foo/src/index.rs",
      related_paths: [],
      test_paths: [],
    };
    const extra = [vendored.path, "third-party/foo/LICENSE"].map((file) => ({
      path: file,
      sha,
      mode: "100644",
      type: "blob",
      size: 10,
    }));
    expect(
      inspectionResponse(listing, vendored, "b".repeat(16), [...tree, ...extra])
        .licensing,
    ).toMatchObject({
      third_party_paths: [vendored.path],
      notice_paths: ["LICENSE", "LICENSES/MIT.txt", "third-party/foo/LICENSE"],
    });
  });

  it("invalidates inspection on hide, removal or re-analysis during tree retrieval", async () => {
    for (const action of ["hide", "remove", "reanalyze"]) {
      db.upsertListing(record(99));
      const listing = db
        .allListings()
        .find((entry) => entry.github_repo_id === 99)!;
      fixture.tree.mockImplementationOnce(async () => {
        if (action === "hide")
          db.db()
            .prepare(
              "UPDATE listings SET moderation_hidden_at='now' WHERE id=?",
            )
            .run(listing.id);
        else if (action === "remove") db.deleteListing(listing.id, 42);
        else db.upsertListing({ ...record(99), source_sha: "b".repeat(40) });
        return tree;
      });
      expect((await inspect.GET(request(), context(listing))).status).toBe(
        action === "reanalyze" ? 409 : 404,
      );
      db.deleteListing(listing.id, 42);
    }
  });

  it("does not emit symlinks, unpinned sources or upstream failures as usable manifests", async () => {
    const listing = db.allListings()[0];
    expect(() =>
      inspectionResponse(
        listing,
        { ...listing.summary.reusable_pieces[0], path: "../escape" },
        "b".repeat(16),
        tree,
      ),
    ).toThrow(/unsafe/);
    fixture.tree.mockResolvedValue(
      tree.map((entry) =>
        entry.path === primary ? { ...entry, mode: "120000" } : entry,
      ),
    );
    expect((await inspect.GET(request(), context(listing))).status).toBe(409);
    fixture.tree.mockRejectedValue(new Error("private provider detail"));
    const failed = await inspect.GET(request(), context(listing));
    expect(failed.status).toBe(503);
    expect(JSON.stringify(await failed.json())).not.toContain(
      "private provider detail",
    );
    db.upsertListing({ ...record(listing.github_repo_id), source_sha: null });
    expect((await inspect.GET(request(), context(listing))).status).toBe(409);
    expect(
      (
        await inspect.GET(request(), {
          params: Promise.resolve({ id: "1e0", part: "invalid" }),
        })
      ).status,
    ).toBe(400);
  });

  it("rechecks early listings after later verification batches finish", async () => {
    for (let id = 4; id <= 10; id++) db.upsertListing(record(id));
    const earlier = db.allListings()[0];
    fixture.status.mockImplementation(async (id: number) => {
      if (id === 1)
        db.db()
          .prepare("UPDATE listings SET moderation_hidden_at='now' WHERE id=?")
          .run(earlier.id);
      return {
        status: "public",
        repo: {
          name: `repo${id}`,
          full_name: `author/repo${id}`,
          html_url: `https://github.com/author/repo${id}`,
          owner: { login: "author" },
        },
      };
    });
    const result = await (await search.GET(request())).json();
    expect(
      result.results.map((entry: { listing_id: number }) => entry.listing_id),
    ).not.toContain(earlier.id);
    expect(result.pagination.total).toBe(9);
  });

  it("reads current owner review after asynchronous tree retrieval", async () => {
    const listing = db.allListings()[0];
    const part = componentId(listing.summary.reusable_pieces[0]);
    fixture.tree.mockImplementationOnce(async () => {
      db.reviewComponent(listing.id, 42, part, sha, listing.analyzed_at!, true);
      return tree;
    });
    expect(
      (await (await inspect.GET(request(), context(listing))).json()).evidence
        .owner_reviewed_at,
    ).toBeTruthy();
  });

  it("honors local hiding during asynchronous search verification", async () => {
    fixture.status.mockImplementation(async (id: number) => {
      db.db()
        .prepare(
          "UPDATE listings SET moderation_hidden_at='now' WHERE github_repo_id=?",
        )
        .run(id);
      return { status: "public", repo: { owner: { login: "author" } } };
    });
    expect((await (await search.GET(request())).json()).results).toEqual([]);
  });
});
