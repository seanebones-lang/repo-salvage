import fs from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
import { createHash } from "node:crypto";

// Explicit consumer adaptation, separate from CLI retrieval. Run only after inspection.
const directory = process.argv[2];
if (!directory) throw new Error("Pass the fetched circuit-breaker directory.");
const manifest = JSON.parse(
  await fs.readFile(path.join(directory, "repo-salvage-manifest.json"), "utf8"),
);
if (
  manifest.source.repository !== "seanebones-lang/Brainstormin-System" ||
  manifest.source.commit !== "120f8b40de0446fe98c13c604ec4281d0f83185d"
)
  throw new Error("This example targets one recorded source version.");
const source = await fs.readFile(
  path.join(directory, "src/lib/circuitBreaker.ts"),
  "utf8",
);
const primary = manifest.files.find(
  (file) => file.path === "src/lib/circuitBreaker.ts",
);
if (
  !primary ||
  createHash("sha256").update(source).digest("hex") !== primary.sha256
)
  throw new Error("Source changed after retrieval; inspect it again.");
const parsed = ts.createSourceFile(
  "circuitBreaker.ts",
  source,
  ts.ScriptTarget.ES2022,
  true,
);
if (
  parsed.statements.some(
    (statement) =>
      ts.isImportDeclaration(statement) ||
      (ts.isExportDeclaration(statement) && statement.moduleSpecifier),
  )
)
  throw new Error(
    "Unexpected runtime import. Inspect dependencies before adapting.",
  );
const result = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ES2022,
  },
  reportDiagnostics: true,
});
if (
  result.diagnostics?.some(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
  )
)
  throw new Error("Transpilation failed.");
await fs.writeFile("circuit.mjs", result.outputText, { flag: "wx" });
console.log(
  "Transpiled the complete pinned file; no implementation edits or runtime imports.",
);
