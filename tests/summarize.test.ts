import { describe, expect, it } from "vitest";
import { parseSummary } from "@/lib/summarize";

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
