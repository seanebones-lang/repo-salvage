import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSummary } from "./parser.mjs";

test("a consumer receives usable bounded data and only known component paths", () => {
  const raw = JSON.stringify({
    overview: "**CSV import** https://untrusted.example " + "x".repeat(500),
    languages: ["JavaScript"],
    frameworks: [],
    reusable_pieces: [
      { name: "CSV parser", path: "lib/csv.mjs", description: "Parses rows" },
      {
        name: "Invented source",
        path: "lib/missing.mjs",
        description: "Not present",
      },
    ],
  });
  const parsed = parseSummary(raw, ["lib/csv.mjs"]);
  assert.equal(parsed.reusable_pieces.length, 1);
  assert.equal(parsed.reusable_pieces[0].path, "lib/csv.mjs");
  assert.equal(parsed.overview.length, 400);
  assert(!parsed.overview.includes("https://"));
  assert(!parsed.overview.includes("**"));
  const usablePaths = parsed.reusable_pieces.map((piece) => piece.path);
  assert.deepEqual(usablePaths, ["lib/csv.mjs"]);
});
test("empty schema fields are supported and malformed JSON is rejected", () => {
  assert.deepEqual(parseSummary("{}", []), {
    overview: "",
    languages: [],
    frameworks: [],
    reusable_pieces: [],
  });
  assert.throws(() => parseSummary("{broken", []), /malformed JSON/);
});
test("the source parser requires schema-shaped arrays; this limitation remains visible", () => {
  assert.throws(
    () => parseSummary('{"languages":"JavaScript"}', []),
    TypeError,
  );
});
