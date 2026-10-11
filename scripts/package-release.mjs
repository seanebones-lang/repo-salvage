/** Build a release from clean tracked source; never sweep local files into it. */
import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const root = path.resolve(import.meta.dirname, "..");
const git = (...args) =>
  execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
if (git("status", "--porcelain", "--untracked-files=no"))
  throw Error("Commit tracked changes before packaging a release.");
if (!process.env.npm_execpath) throw Error("Use npm run package:release.");
// Regenerate every downloadable archive from this checkout, avoiding stale bundles.
execFileSync(process.execPath, [process.env.npm_execpath, "run", "prebuild"], {
  cwd: root,
  stdio: "inherit",
});
const readPackage = async (file) =>
  JSON.parse(await fs.readFile(path.join(root, file), "utf8"));
const app = await readPackage("package.json");
const cli = await readPackage("packages/cli/package.json");
const mcp = await readPackage("packages/mcp/package.json");
if (!/^\d+\.\d+\.\d+$/.test(app.version))
  throw Error("Invalid application release version.");
const commit = git("rev-parse", "HEAD");
const directory = path.join(root, "artifacts/releases", `v${app.version}`);
await fs.mkdir(directory, { recursive: true });
const source = `repo-salvage-${app.version}-source.tar.gz`;
git(
  "archive",
  "--format=tar.gz",
  `--prefix=repo-salvage-${app.version}/`,
  `--output=${path.join(directory, source)}`,
  commit,
);
const files = [source];
for (const name of [
  "repo-salvage-cli.tgz",
  "repo-salvage-mcp.tgz",
  "summary-parser.tar.gz",
  "assignment-consumer.tar.gz",
  "integer-word-consumer.tar.gz",
  "rust-edit-distance.tar.gz",
  "go-rendezvous-consumer.tar.gz",
  "openapi.json",
]) {
  await fs.copyFile(
    path.join(root, "public", name),
    path.join(directory, name),
  );
  files.push(name);
}
const assets = [];
for (const name of files) {
  const bytes = await fs.readFile(path.join(directory, name));
  assets.push({
    name,
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
}
const manifest = "RELEASE-MANIFEST.json";
await fs.writeFile(
  path.join(directory, manifest),
  JSON.stringify(
    {
      application: app.version,
      cli: cli.version,
      mcp: mcp.version,
      source_commit: commit,
      npm_publication: false,
      hosted_catalog: false,
      assets,
    },
    null,
    2,
  ) + "\n",
);
const manifestBytes = await fs.readFile(path.join(directory, manifest));
assets.push({
  name: manifest,
  sha256: createHash("sha256").update(manifestBytes).digest("hex"),
});
await fs.writeFile(
  path.join(directory, "SHA256SUMS"),
  assets.map(({ name, sha256 }) => `${sha256}  ${name}\n`).join(""),
);
console.log(
  `Packaged ${app.version} at ${commit}: source, CLI ${cli.version}, MCP ${mcp.version}, five example bundles, contract, manifest and checksums.\n${directory}`,
);
