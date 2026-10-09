import fs from "node:fs/promises";
import path from "node:path";
import { directory, root, loadSuite, sha256 } from "../suite.mjs";
import { followupFiles } from "./run.mjs";
if (process.argv.length !== 3 || process.argv[2] !== "--freeze")
  throw Error("Use --freeze before diagnostic model sessions.");
const filename = new URL("./seal.json", import.meta.url);
try {
  await fs.access(filename);
  throw Error("Follow-up already frozen; create another epoch.");
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
const base = await loadSuite();
const files = await Promise.all(
  followupFiles.map(async (name) => ({
    name,
    sha256: sha256(await fs.readFile(path.join(directory, name))),
  })),
);
await fs.writeFile(
  filename,
  JSON.stringify(
    {
      format: "repo-salvage/language-followup-seal-v1",
      baseSealSha256: sha256(base.sealBytes),
      files,
      archiveSha256: sha256(
        await fs.readFile(path.join(root, "public/repo-salvage-mcp.tgz")),
      ),
      catalogRevision: base.catalog.catalog_revision,
    },
    null,
    2,
  ) + "\n",
  { flag: "wx" },
);
console.log(
  "Frozen unchanged negative questions, original controls and updated MCP archive before rechecks.",
);
