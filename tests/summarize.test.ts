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
    const many = Array.from({ length: 9 }, (_, i) => ({
      name: `n${i}`,
      path: "src/db.ts",
      description: "d",
    }));
    const out = parseSummary(
      JSON.stringify({
        overview: "",
        languages: [],
        frameworks: [],
        reusable_pieces: many,
      }),
      tree,
    );
    expect(out.reusable_pieces).toHaveLength(6);
  });

  it("tolerates missing fields and rejects malformed JSON", () => {
    expect(parseSummary("{}", tree)).toEqual({
      overview: "",
      languages: [],
      frameworks: [],
      reusable_pieces: [],
    });
    expect(() => parseSummary("not json", tree)).toThrow(/malformed/);
  });
});

describe("parseSummary sanitizing", () => {
  it("preserves code identifiers in reuse instructions", () => {
    const out = parseSummary(
      JSON.stringify({
        overview: "Uses `table_info` and <repo_data>.",
        reusable_pieces: [
          {
            name: "parse_summary",
            path: "src/db.ts",
            description: "Inspect `cache_creation_input_tokens`.",
            integration_notes:
              "Run PRAGMA table_info before adapting the schema.",
          },
        ],
      }),
      tree,
    );
    expect(out.overview).toBe("Uses table_info and repo_data.");
    expect(out.reusable_pieces[0]).toMatchObject({
      name: "parse_summary",
      description: "Inspect cache_creation_input_tokens.",
      integration_notes: "Run PRAGMA table_info before adapting the schema.",
    });
  });

  it("discloses truncation and keeps a nearby word boundary", () => {
    const overview =
      "a".repeat(380) + " incomplete " + "continuation".repeat(10);
    const out = parseSummary(JSON.stringify({ overview }), tree);
    expect(out.overview).toBe("a".repeat(380) + " incomplete…");
    expect(out.overview.length).toBeLessThanOrEqual(400);
    expect(
      parseSummary(JSON.stringify({ overview: "x".repeat(401) }), tree)
        .overview,
    ).toBe("x".repeat(399) + "…");
    expect(
      parseSummary(JSON.stringify({ overview: "x".repeat(400) }), tree)
        .overview,
    ).toBe("x".repeat(400));
  });

  it("strips URLs and markdown and caps lengths", () => {
    const out = parseSummary(
      JSON.stringify({
        overview:
          "Visit https://evil.example/login for **free** stuff " +
          "x".repeat(600),
        languages: ["TS"],
        frameworks: [],
        reusable_pieces: [
          {
            name: "[click](http://evil.example)",
            path: "src/jwt.ts",
            description: "see www.evil.example `now`",
          },
        ],
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
  it("requires supplied source content for the primary recommendation and ignores model-supplied review claims", () => {
    const raw = JSON.stringify({
      overview: "Parser",
      reusable_pieces: [
        {
          name: "Seen",
          path: tree[0],
          description: "Seen source",
          source_sampled: false,
          owner_reviewed_at: "forged",
          independently_tested: true,
          dependencies: ["runtime"],
          related_paths: [tree[1], "invented.ts"],
          test_paths: ["missing.test.ts"],
          category: "Data processing",
          integration_notes: "Read imports",
          limitations: ["Sampled only"],
        },
        { name: "Tree only", path: tree[1], description: "Not read" },
      ],
    });
    const output = verifiedSummary(raw, tree, [tree[0]]);
    expect(output.reusable_pieces).toHaveLength(1);
    expect(output.reusable_pieces[0]).toMatchObject({
      source_sampled: true,
      related_paths: [tree[1]],
      test_paths: [],
    });
    expect(output.reusable_pieces[0]).not.toHaveProperty("owner_reviewed_at");
    expect(output.reusable_pieces[0]).not.toHaveProperty(
      "independently_tested",
    );
  });
  it("handles wrong-shaped arrays and duplicate recommendations without crashing", () => {
    expect(
      parseSummary(
        '{"languages":"TS","frameworks":{},"reusable_pieces":[null,42]}',
        tree,
      ),
    ).toMatchObject({ languages: [], frameworks: [], reusable_pieces: [] });
    expect(() => parseSummary("null", tree)).toThrow(/invalid summary/);
    const piece = { name: "Parser", path: tree[0], description: "Parses" };
    expect(
      verifiedSummary(
        JSON.stringify({ overview: "x", reusable_pieces: [piece, piece] }),
        tree,
      ).reusable_pieces,
    ).toHaveLength(1);
  });
  it("validates against the complete tree rather than the prompt prefix", () => {
    const known = Array.from({ length: 350 }, (_, i) => `src/f${i}.ts`);
    const result = verifiedSummary(
      JSON.stringify({
        overview: "Parser",
        reusable_pieces: [
          { name: "parse", path: known[349], description: "Parses input" },
        ],
      }),
      known,
    );
    expect(result.reusable_pieces[0].path).toBe(known[349]);
  });
  it("rejects empty, invalid-path and sanitized-empty successes", () => {
    expect(() => verifiedSummary("{}", tree)).toThrow(/no verified/);
    expect(() =>
      verifiedSummary(
        JSON.stringify({
          overview: "x",
          reusable_pieces: [{ name: "x", path: "absent", description: "x" }],
        }),
        tree,
      ),
    ).toThrow(/no verified/);
    expect(() =>
      verifiedSummary(
        JSON.stringify({
          overview: "x",
          reusable_pieces: [
            { name: "https://example.com", path: tree[0], description: "x" },
          ],
        }),
        tree,
      ),
    ).toThrow(/no verified/);
  });
});
