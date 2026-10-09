import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const temp = await fs.mkdtemp(path.join(os.tmpdir(), "salvage-cli-pack-"));
try {
  const result = spawnSync(
    process.platform === "win32" ? "npm.cmd" : "npm",
    [
      "pack",
      "./packages/cli",
      "--pack-destination",
      temp,
      "--json",
      "--ignore-scripts",
    ],
    { cwd: root, encoding: "utf8" },
  );
  if (result.status !== 0)
    throw new Error("CLI packaging failed: " + result.stderr);
  const [archive] = JSON.parse(result.stdout);
  const allowed = new Set([
    "LICENSE",
    "README.md",
    "package.json",
    "bin/repo-salvage.mjs",
    "lib/client.mjs",
  ]);
  if (
    archive.files.length !== allowed.size ||
    archive.files.some((file) => !allowed.has(file.path))
  )
    throw new Error("Unexpected file in CLI archive");
  await fs.mkdir(path.join(root, "public"), { recursive: true });
  await fs.copyFile(
    path.join(temp, archive.filename),
    path.join(root, "public/repo-salvage-cli.tgz"),
  );
  console.log("Packaged standalone agent CLI (five allowlisted files).");
} finally {
  await fs.rm(temp, { recursive: true, force: true });
}
