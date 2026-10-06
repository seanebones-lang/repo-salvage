import { describe, expect, it } from "vitest";
import { parseSummary, verifiedSummary } from "@/lib/summarize";

const tree = ["src/jwt.ts", "src/db.ts", "README.md"];

describe("parseSummary", () => {
  it("drops reusable pieces whose path is not in the repo tree", () => {
    const out = parseSummary(
      JSON.stringify({
        overview: "o",
        languages: ["TS"],
        frameworks: [],
        reusable_pieces: [
          { name: "real", path: "src/jwt.ts", description: "a" },
          { name: "invented", path: "src/ghost.ts", description: "b" },
        ],
      }),
      tree,
    );
    expect(out.reusable_pieces.map((p) => p.name)).toEqual(["real"]);
  });

  it("caps pieces at 6", () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ name: `n${i}`, path: "src/db.ts", description: "d" }));
    const out = parseSummary(JSON.stringify({ overview: "", languages: [], frameworks: [], reusable_pieces: many }), tree);
    expect(out.reusable_pieces).toHaveLength(6);
  });

  it("tolerates missing fields and rejects malformed JSON", () => {
    expect(parseSummary("{}", tree)).toEqual({ overview: "", languages: [], frameworks: [], reusable_pieces: [] });
    expect(() => parseSummary("not json", tree)).toThrow(/malformed/);
  });
});

describe("parseSummary sanitizing", () => {
  it("strips URLs and markdown and caps lengths", () => {
    const out = parseSummary(
      JSON.stringify({
        overview: "Visit https://evil.example/login for **free** stuff " + "x".repeat(600),
        languages: ["TS"],
        frameworks: [],
        reusable_pieces: [{ name: "[click](http://evil.example)", path: "src/jwt.ts", description: "see www.evil.example `now`" }],
      }),
      tree,
    );
    expect(out.overview).not.toMatch(/evil|\*|http/);
    expect(out.overview.length).toBeLessThanOrEqual(400);
    expect(out.reusable_pieces[0].name).not.toMatch(/http|\[|\]/);
    expect(out.reusable_pieces[0].description).not.toMatch(/www|`/);
  });
});

describe("verified generation", () => {
  it("validates against the complete tree rather than the prompt prefix", () => {
    const known = Array.from({ length: 350 }, (_, i) => `src/f${i}.ts`);
    const result = verifiedSummary(JSON.stringify({ overview: "Parser", reusable_pieces: [{ name: "parse", path: known[349], description: "Parses input" }] }), known);
    expect(result.reusable_pieces[0].path).toBe(known[349]);
  });
  it("rejects empty, invalid-path and sanitized-empty successes", () => {
    expect(() => verifiedSummary("{}", tree)).toThrow(/no verified/);
    expect(() => verifiedSummary(JSON.stringify({ overview: "x", reusable_pieces: [{ name: "x", path: "absent", description: "x" }] }), tree)).toThrow(/no verified/);
    expect(() => verifiedSummary(JSON.stringify({ overview: "x", reusable_pieces: [{ name: "https://example.com", path: tree[0], description: "x" }] }), tree)).toThrow(/no verified/);
  });
});
