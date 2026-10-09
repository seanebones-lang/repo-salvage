import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  listPublicRepos: vi.fn(),
  listingsByOwner: vi.fn(),
  getListing: vi.fn(),
  searchListings: vi.fn(),
  verifiedPublicRepo: vi.fn(),
}));
vi.mock("@/auth", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/db", () => ({
  listingsByOwner: mocks.listingsByOwner,
  getListing: mocks.getListing,
  searchListings: mocks.searchListings,
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
