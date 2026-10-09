// Adapted from src/lib/summarize.ts at cfeeae509e90b15c04ceabd2a3f7b315dd303b43.
// Copyright (c) 2026 NextEleven. MIT; see LICENSE.
// Changes: removed TypeScript annotations and provider/database imports; exported the parser.
const clean = (value, max) =>
  String(value ?? "")
    .replace(/https?:\/\/\S+|www\.\S+/gi, "")
    .replace(/[`*_#<>\[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

/** Expects schema-shaped model JSON. A known path is not proof of usable code. */
export function parseSummary(raw, tree) {
  let summary;
  try {
    summary = JSON.parse(raw);
  } catch {
    throw new Error("Model returned malformed JSON");
  }
  const known = new Set(tree);
  return {
    overview: clean(summary.overview, 400),
    languages: (summary.languages ?? [])
      .map((x) => clean(x, 40))
      .filter(Boolean)
      .slice(0, 10),
    frameworks: (summary.frameworks ?? [])
      .map((x) => clean(x, 40))
      .filter(Boolean)
      .slice(0, 10),
    reusable_pieces: (summary.reusable_pieces ?? [])
      .filter((piece) => known.has(piece.path))
      .slice(0, 6)
      .map((piece) => ({
        name: clean(piece.name, 80),
        path: piece.path,
        description: clean(piece.description, 240),
      })),
  };
}
