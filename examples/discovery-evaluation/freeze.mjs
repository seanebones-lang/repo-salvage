/** Freeze before model use; completed epochs are preserved. */
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
const directory = import.meta.dirname;
if (process.argv.length !== 3 || process.argv[2] !== "--freeze")
  throw Error("Use --freeze before any model trial.");
try {
  await fs.access(path.join(directory, "seal.json"));
  throw Error(
    "Epoch already frozen. Create a new epoch rather than editing its questions.",
  );
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const names = ["cases.json", "catalog.json", "controls.json"];
const buffers = await Promise.all(
  names.map((n) => fs.readFile(path.join(directory, n))),
);
const suite = JSON.parse(buffers[0]),
  catalog = JSON.parse(buffers[1]);
if (
  suite.cases.length !== 10 ||
  new Set(suite.cases.map((c) => c.id)).size !== 10 ||
  catalog.pagination.total !== 34
)
  throw Error("Invalid discovery corpus.");
const archive = await fs.readFile(
  path.join(directory, "../../public/repo-salvage-mcp.tgz"),
);
await fs.writeFile(
  path.join(directory, "seal.json"),
  JSON.stringify(
    {
      format: "repo-salvage/discovery-seal-v1",
      casesSha256: sha(buffers[0]),
      catalogSha256: sha(buffers[1]),
      controlsSha256: sha(buffers[2]),
      archiveSha256: sha(archive),
      catalogRevision: catalog.catalog_revision,
    },
    null,
    2,
  ) + "\n",
);
