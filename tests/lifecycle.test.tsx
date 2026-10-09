import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  listPublicRepos: vi.fn(),
  listingsByOwner: vi.fn(),
  getListing: vi.fn(),
  searchListings: vi.fn(),
  allListings: vi.fn(),
  verifiedPublicRepo: vi.fn(),
}));
vi.mock("@/auth", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/db", () => ({
  listingsByOwner: mocks.listingsByOwner,
  getListing: mocks.getListing,
  searchListings: mocks.searchListings,
  allListings: mocks.allListings,
}));
vi.mock("@/lib/github", () => ({
  listPublicRepos: mocks.listPublicRepos,
  verifiedPublicRepo: mocks.verifiedPublicRepo,
}));
vi.mock("@/app/dashboard/actions", () => ({
  unlist: vi.fn(),
  salvage: vi.fn(),
}));
vi.mock("@/app/dashboard/repo-row", () => ({ default: () => null }));
import Home from "@/app/page";
import Dashboard from "@/app/dashboard/page";
import ListingPage from "@/app/listing/[id]/page";
import { getPublicListing, visibleListings } from "@/lib/public-listings";
import type { Listing } from "@/lib/db";

const listing: Listing = {
  owner_login: "me",
  name: "deleted",
  description: null,
  language: null,
  stars: 0,
  forks: 0,
  license: null,
  last_human_commit: null,
  owner_note: null,
  used_count: 0,
  created_at: "2026-10-06",
  id: 7,
  github_repo_id: 1,
  owner_id: 42,
  full_name: "me/deleted",
  url: "https://github.com/me/deleted",
  source_sha: "a".repeat(40),
  analyzed_at: "2026-10-06T18:00:00Z",
  summary_model: "actual-model",
  summary: {
    overview: "Parser",
    languages: [],
    frameworks: [],
    reusable_pieces: [
      { name: "parse", path: "src/a b.ts", description: "Parses" },
    ],
  },
};
afterEach(() => vi.resetAllMocks());

describe("listing lifecycle", () => {
  it("uses the current repository slug after a rename while preserving the analyzed commit", async () => {
    mocks.getListing.mockReturnValue(listing);
    mocks.verifiedPublicRepo.mockResolvedValue({
      name: "renamed",
      full_name: "me/renamed",
      html_url: "https://github.com/me/renamed",
      owner: { login: "me" },
    });
    const current = await getPublicListing(7);
    expect(current).toMatchObject({
      url: "https://github.com/me/renamed",
      source_sha: listing.source_sha,
    });
  });
  it("suppresses operator-hidden listings without making a public source request", async () => {
    const hidden = { ...listing, moderation_hidden_at: "2026-10-08" };
    mocks.getListing.mockReturnValue(hidden);
    expect(await getPublicListing(7)).toBeNull();
    expect(await visibleListings([hidden])).toEqual([]);
    expect(mocks.verifiedPublicRepo).not.toHaveBeenCalled();
  });
  it.each([false, true])(
    "retains stored removal controls when public inventory is absent (GitHub failure: %s)",
    async (failure) => {
      mocks.getSession.mockResolvedValue({ ghId: 42 });
      mocks.listingsByOwner.mockReturnValue([listing]);
      if (failure)
        mocks.listPublicRepos.mockRejectedValue(new Error("offline"));
      else mocks.listPublicRepos.mockResolvedValue([]);
      const html = renderToStaticMarkup(await Dashboard());
      expect(html).toContain("me/deleted");
      expect(html).toContain("Remove listing");
      expect(html).toContain('value="7"');
    },
  );
  it("hides inaccessible listings from public detail and index", async () => {
    mocks.getListing.mockReturnValue(listing);
    mocks.verifiedPublicRepo.mockResolvedValue(null);
    expect(await getPublicListing(7)).toBeNull();
    expect(await visibleListings([listing])).toEqual([]);
    expect(mocks.verifiedPublicRepo).toHaveBeenCalledWith(1, 42);
  });
  it("renders immutable, encoded component links and provenance", async () => {
    mocks.getListing.mockReturnValue(listing);
    mocks.verifiedPublicRepo.mockResolvedValue({
      name: listing.name,
      full_name: listing.full_name,
      html_url: listing.url,
      owner: { login: listing.owner_login },
    });
    const html = renderToStaticMarkup(
      await ListingPage({ params: Promise.resolve({ id: "7" }) }),
    );
    expect(html).toContain(`/blob/${listing.source_sha}/src/a%20b.ts`);
    expect(html).not.toContain("/blob/HEAD/");
    expect(html).toContain("actual-model");
    expect(html).toContain(listing.analyzed_at!);
  });
  it("does not invent a source ref for legacy listings", async () => {
    mocks.getListing.mockReturnValue({ ...listing, source_sha: null });
    mocks.verifiedPublicRepo.mockResolvedValue({
      name: listing.name,
      full_name: listing.full_name,
      html_url: listing.url,
      owner: { login: listing.owner_login },
    });
    const html = renderToStaticMarkup(
      await ListingPage({ params: Promise.resolve({ id: "7" }) }),
    );
    expect(html).toContain("Legacy summary");
    expect(html).not.toContain("/blob/");
  });
});

describe("changes during public verification", () => {
  it.each(["hidden", "deleted", "transferred"])(
    "fails closed when a listing is %s while GitHub is responding",
    async (change) => {
      mocks.getListing.mockReturnValueOnce(listing).mockReturnValue(
        change === "deleted"
          ? null
          : {
              ...listing,
              ...(change === "hidden"
                ? { moderation_hidden_at: "now" }
                : { owner_id: 99 }),
            },
      );
      mocks.verifiedPublicRepo.mockResolvedValue({
        name: listing.name,
        full_name: listing.full_name,
        html_url: listing.url,
        owner: { login: "me" },
      });
      expect(await getPublicListing(7)).toBeNull();
    },
  );
  it("uses the latest stored analysis after verification instead of an obsolete brief", async () => {
    mocks.getListing.mockReturnValueOnce(listing).mockReturnValue({
      ...listing,
      source_sha: "b".repeat(40),
      analyzed_at: "later",
    });
    mocks.verifiedPublicRepo.mockResolvedValue({
      name: listing.name,
      full_name: listing.full_name,
      html_url: listing.url,
      owner: { login: "me" },
    });
    expect(await getPublicListing(7)).toMatchObject({
      source_sha: "b".repeat(40),
      analyzed_at: "later",
    });
  });
});

describe("catalog pagination with populated inventory", () => {
  function catalog() {
    const rows = Array.from({ length: 3 }, (_, i) => ({
      ...listing,
      id: i + 1,
      github_repo_id: i + 1,
      summary: {
        ...listing.summary,
        languages: ["TypeScript"],
        reusable_pieces: Array.from({ length: 6 }, (_, n) => ({
          name: `Part ${i}-${n}`,
          path: `part-${n}.ts`,
          description: "Parses input",
          category: "Data processing",
        })),
      },
    }));
    mocks.allListings.mockReturnValue(rows);
    mocks.getListing.mockImplementation(
      (id: number) => rows.find((row) => row.id === id) ?? null,
    );
    mocks.verifiedPublicRepo.mockResolvedValue({
      name: "parser",
      full_name: "me/parser",
      html_url: "https://github.com/me/parser",
      owner: { login: "me" },
    });
    return rows;
  }
  it("clamps the page, preserves filters in navigation and returns the final six components", async () => {
    catalog();
    const html = renderToStaticMarkup(
      await Home({
        searchParams: Promise.resolve({
          q: "parses",
          language: "TypeScript",
          category: "Data processing",
          sort: "name",
          page: "999",
        }),
      }),
    );
    expect(html).toContain("18 matching parts");
    expect(html).toContain("Page 2 of 2");
    expect(html).toContain("Part 2-0");
    expect(html).not.toContain("Part 0-0");
    expect(html).toContain(
      "q=parses&amp;language=TypeScript&amp;category=Data+processing&amp;sort=name&amp;page=1",
    );
  });
  it("uses the first page for malformed page numbers and exposes clear filters for empty searches", async () => {
    catalog();
    const first = renderToStaticMarkup(
      await Home({ searchParams: Promise.resolve({ page: "NaN" }) }),
    );
    expect(first).toContain("Page 1 of 2");
    const empty = renderToStaticMarkup(
      await Home({ searchParams: Promise.resolve({ q: "nonexistent" }) }),
    );
    expect(empty).toContain("0 matching parts");
    expect(empty).toContain("Clear filters");
  });
});
