/** Freeze the selected corpus and rubric before native sessions. No overwrite. */
import fs from "node:fs/promises";
import path from "node:path";
import {
  directory,
  root,
  frozenFiles,
  sha256,
  validateSources,
  hydrateControls,
} from "./suite.mjs";
const [mode, origin] = process.argv.slice(2);
if (
  mode !== "--freeze" ||
  process.argv.length !== 4 ||
  !/^http:\/\/127\.0\.0\.1:\d+$/.test(origin) ||
  origin.endsWith(":3187")
)
  throw Error("Use --freeze with the separate loopback evaluation origin.");
const filename = path.join(directory, "seal.json");
try {
  await fs.access(filename);
  throw Error("Epoch already sealed. Create a new epoch.");
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
const corpus = JSON.parse(
  await fs.readFile(path.join(directory, "corpus.json"), "utf8"),
);
const controls = JSON.parse(
  await fs.readFile(path.join(directory, "controls.json"), "utf8"),
);
validateSources(corpus);
hydrateControls(controls, corpus);
const response = await fetch(origin + "/api/v2/parts?limit=50", {
  redirect: "error",
  signal: AbortSignal.timeout(30000),
});
if (!response.ok) throw Error("Production evaluation catalog unavailable.");
const catalog = await response.json();
if (catalog.pagination.total !== 40)
  throw Error("Expected 34 existing plus six authored competitors.");
await fs.writeFile(
  path.join(directory, "catalog.json"),
  JSON.stringify(catalog, null, 2) + "\n",
  { flag: "wx" },
);
const files = await Promise.all(
  frozenFiles.map(async (name) => ({
    name,
    sha256: sha256(await fs.readFile(path.join(directory, name))),
  })),
);
await fs.writeFile(
  filename,
  JSON.stringify(
    {
      format: "repo-salvage/competing-seal-v1",
      files,
      archiveSha256: sha256(
        await fs.readFile(path.join(root, "public/repo-salvage-mcp.tgz")),
      ),
      catalogRevision: catalog.catalog_revision,
    },
    null,
    2,
  ) + "\n",
  { flag: "wx" },
);
console.log(
  "Frozen ten tasks, source controls, production catalog and harness before model use.",
);
