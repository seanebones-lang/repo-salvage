import { describe, expect, it } from "vitest";
import {
  componentsOf,
  filterComponents,
  componentId,
  reuseBrief,
} from "@/lib/components";
import { exampleListing } from "@/lib/examples";

describe("component catalog", () => {
  it("matches the individual piece instead of returning every piece in a matching repository", () => {
    const entries = componentsOf([exampleListing]);
    expect(
      filterComponents(entries, { q: "parser" }).map((e) => e.piece.name),
    ).toEqual(["Evidence-bound summary parser"]);
    expect(
      filterComponents(entries, {
        category: "Storage",
        language: "TypeScript",
        license: "MIT",
      }),
    ).toHaveLength(1);
    expect(filterComponents(entries, { language: "Python" })).toEqual([]);
    expect(filterComponents(entries, { q: "parser nonexistent" })).toEqual([]);
  });
  it("keeps component identity stable across reordering and encodes source paths", () => {
    const piece = { name: "Parser", path: "src/a b#c.ts", description: "x" };
    const updated = { ...piece, description: "updated" };
    expect(componentId(piece)).toBe(componentId(updated));
    const brief = reuseBrief(exampleListing, piece);
    expect(brief.source_url).toContain("src/a%20b%23c.ts");
    expect(brief.evidence.independently_tested).toBe(false);
    expect(
      reuseBrief({ ...exampleListing, source_sha: null }, piece).source_url,
    ).toBeNull();
  });
  it("uses explicit owner reviews for ordering without inventing test verification", () => {
    const entries = componentsOf([exampleListing]);
    entries[2] = {
      ...entries[2],
      piece: { ...entries[2].piece, owner_reviewed_at: "2026-10-08" },
    };
    expect(filterComponents(entries, { sort: "reviewed" })[0].id).toBe(
      entries[2].id,
    );
    expect(
      reuseBrief(entries[2].listing, entries[2].piece).evidence
        .independently_tested,
    ).toBe(false);
  });
});
