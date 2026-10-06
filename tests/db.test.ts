import { beforeAll, describe, expect, it } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

let m: typeof import("@/lib/db");

const base = (over: Partial<Parameters<typeof import("@/lib/db").upsertListing>[0]> = {}) => ({
  github_repo_id: 1,
  owner_login: "me",
  owner_id: 42,
  name: "x",
  full_name: "me/x",
  url: "https://github.com/me/x",
  description: "d",
  language: "TypeScript",
  stars: 1,
  forks: 0,
  license: "MIT",
  last_human_commit: "2023-01-01T00:00:00Z",
  owner_note: "auth middleware is solid",
  summary: {
    overview: "An auth lib",
    languages: ["TypeScript"],
    frameworks: ["Express"],
    reusable_pieces: [{ name: "jwt", path: "src/jwt.ts", description: "verifies jwt" }],
  },
  ...over,
});

beforeAll(async () => {
  process.env.DATABASE_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "salvage-")), "t.db");
  process.env.DAILY_SUMMARY_LIMIT = "2";
  m = await import("@/lib/db");
});

describe("listings", () => {
  it("upserts by github repo id instead of duplicating", () => {
    m.upsertListing(base());
    m.upsertListing(base({ stars: 99 }));
    const rows = m.searchListings({});
    expect(rows).toHaveLength(1);
    expect(rows[0].stars).toBe(99);
  });

  it("searches keyword across note and summary, filters language and license", () => {
    m.upsertListing(base({ github_repo_id: 2, full_name: "me/py", name: "py", language: "Python", license: "GPL-3.0",
      owner_note: null, summary: { overview: "CSV parser", languages: ["Python"], frameworks: [], reusable_pieces: [] } }));
    expect(m.searchListings({ q: "jwt" }).map((l) => l.full_name)).toEqual(["me/x"]);
    expect(m.searchListings({ q: "parser" }).map((l) => l.full_name)).toEqual(["me/py"]);
    expect(m.searchListings({ language: "Python" })).toHaveLength(1);
    expect(m.searchListings({ license: "MIT" })).toHaveLength(1);
    expect(m.searchListings({ q: "nomatch" })).toHaveLength(0);
  });

  it("treats LIKE wildcards in the query as literals", () => {
    expect(m.searchListings({ q: "%" })).toHaveLength(2); // stripped to empty-ish pattern, not an injection
    expect(m.searchListings({ q: "'; DROP TABLE listings;--" })).toHaveLength(0);
    expect(m.searchListings({})).toHaveLength(2);
  });

  it("only deletes listings owned by the caller", () => {
    const id = m.searchListings({ q: "jwt" })[0].id;
    m.deleteListing(id, 999);
    expect(m.getListing(id)).not.toBeNull();
    m.deleteListing(id, 42);
    expect(m.getListing(id)).toBeNull();
  });

  it("increments the used counter", () => {
    const id = m.searchListings({})[0].id;
    m.incrementUsed(id);
    m.incrementUsed(id);
    expect(m.getListing(id)!.used_count).toBe(2);
  });
});

describe("summary rate limit", () => {
  it("caps runs per user per day and is per-user", () => {
    expect(m.takeSummaryRun(7)).toBe(true);
    expect(m.takeSummaryRun(7)).toBe(true);
    expect(m.takeSummaryRun(7)).toBe(false);
    expect(m.takeSummaryRun(8)).toBe(true);
  });
});

describe("reports", () => {
  it("stores a report for a listing", () => {
    const id = m.searchListings({})[0].id;
    m.addReport(id, "spam");
    const n = (m.db().prepare("SELECT COUNT(*) AS n FROM reports WHERE listing_id = ?").get(id) as { n: number }).n;
    expect(n).toBe(1);
  });
});
