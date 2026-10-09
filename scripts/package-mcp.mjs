import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "..");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const build = spawnSync(
  npm,
  ["run", "build", "--workspace", "@repo-salvage/mcp"],
  { cwd: root, stdio: "inherit" },
);
if (build.status !== 0) throw new Error("MCP build failed");
const temp = await fs.mkdtemp(path.join(os.tmpdir(), "salvage-mcp-pack-"));
try {
  const result = spawnSync(
    npm,
    [
      "pack",
      "./packages/mcp",
      "--pack-destination",
      temp,
      "--json",
      "--ignore-scripts",
    ],
    { cwd: root, encoding: "utf8" },
  );
  if (result.status !== 0) throw new Error("MCP packaging failed");
  const [archive] = JSON.parse(result.stdout);
  const allowed = new Set([
    "LICENSE",
    "README.md",
    "package.json",
    "dist/index.js",
    "dist/index.d.ts",
    "dist/server.js",
    "dist/server.d.ts",
    "dist/client.mjs",
    "dist/client.d.mts",
    "dist/contracts.json",
  ]);
  if (
    archive.files.length !== allowed.size ||
    archive.files.some((file) => !allowed.has(file.path))
  )
    throw new Error("Unexpected file in MCP archive");
  await fs.copyFile(
    path.join(temp, archive.filename),
    path.join(root, "public/repo-salvage-mcp.tgz"),
  );
  console.log("Packaged standalone MCP adapter (ten allowlisted files).");
} finally {
  await fs.rm(temp, { recursive: true, force: true });
}
