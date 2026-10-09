import { createHash } from "node:crypto";
import type { Listing, ReusablePiece } from "./db";

export const CATEGORIES = [
  "Authentication",
  "Data processing",
  "API & networking",
  "UI & interaction",
  "Developer tools",
  "Storage",
  "Other",
] as const;
export type Category = (typeof CATEGORIES)[number];

export function componentId(piece: Pick<ReusablePiece, "path" | "name">) {
  return createHash("sha256")
    .update(JSON.stringify([piece.path, piece.name]))
    .digest("hex")
    .slice(0, 16);
}

export type ComponentEntry = {
  listing: Listing;
  piece: ReusablePiece;
  id: string;
};
export function componentsOf(listings: Listing[]): ComponentEntry[] {
  return listings.flatMap((listing) =>
    listing.summary.reusable_pieces.map((piece) => ({
      listing,
      piece,
      id: componentId(piece),
    })),
  );
}

export type ComponentFilters = {
  q?: string;
  language?: string;
  license?: string;
  category?: string;
  sort?: string;
  page?: string;
};
export function filterComponents(
  entries: ComponentEntry[],
  filters: ComponentFilters,
) {
  const terms = (filters.q ?? "")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  const selected = entries.filter(({ listing, piece }) => {
    const text = [
      piece.name,
      piece.description,
      piece.path,
      piece.category,
      ...(piece.dependencies ?? []),
      piece.integration_notes,
      ...(piece.limitations ?? []),
      listing.full_name,
      listing.owner_note,
      ...listing.summary.frameworks,
    ]
      .join(" ")
      .toLowerCase();
    return (
      terms.every((term) => text.includes(term)) &&
      (!filters.language ||
        listing.summary.languages.includes(filters.language) ||
        listing.language === filters.language) &&
      (!filters.license || listing.license === filters.license) &&
      (!filters.category || (piece.category ?? "Other") === filters.category)
    );
  });
  return selected.sort((a, b) => {
    if (filters.sort === "name")
      return a.piece.name.localeCompare(b.piece.name);
    if (filters.sort === "reviewed") {
      const reviewed =
        Number(!!b.piece.owner_reviewed_at) -
        Number(!!a.piece.owner_reviewed_at);
      if (reviewed) return reviewed;
    }
    return (
      (b.listing.analyzed_at ?? b.listing.created_at).localeCompare(
        a.listing.analyzed_at ?? a.listing.created_at,
      ) ||
      a.listing.id - b.listing.id ||
      a.id.localeCompare(b.id)
    );
  });
}

export function sourceUrl(listing: Listing, file: string) {
  if (!listing.source_sha) return null;
  return `${listing.url}/blob/${listing.source_sha}/${file.split("/").map(encodeURIComponent).join("/")}`;
}

export function reuseBrief(listing: Listing, piece: ReusablePiece) {
  return {
    format: "repo-salvage/reuse-brief-v1",
    name: piece.name,
    description: piece.description,
    category: piece.category ?? "Other",
    repository: listing.full_name,
    source_commit: listing.source_sha,
    source_url: sourceUrl(listing, piece.path),
    files: [piece.path, ...(piece.related_paths ?? [])].map((file) => ({
      path: file,
      url: sourceUrl(listing, file),
    })),
    dependencies: piece.dependencies ?? [],
    integration_notes: piece.integration_notes ?? null,
    limitations: piece.limitations ?? [],
    license: listing.license,
    license_notice:
      "Repository metadata is not a component license audit. Check the source license and notices before reuse.",
    evidence: {
      sampled_source: piece.source_sampled === true,
      owner_reviewed_at: piece.owner_reviewed_at ?? null,
      independently_tested: false,
      test_files: piece.test_paths ?? [],
      analyzed_at: listing.analyzed_at,
      model: listing.summary_model,
    },
  };
}
