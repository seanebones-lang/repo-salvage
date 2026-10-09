import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
const here = import.meta.dirname;
const root = path.resolve(here, "../..");
await fs.copyFile(
  path.join(root, "packages/cli/lib/client.mjs"),
  path.join(here, "src/client.mjs"),
);
const contract = JSON.parse(
  await fs.readFile(path.join(root, "public/openapi.json"), "utf8"),
);
await fs.writeFile(
  path.join(here, "src/contracts.json"),
  JSON.stringify(contract.components.schemas),
);
const check = process.argv.includes("--check");
if (!check)
  await fs.rm(path.join(here, "dist"), { recursive: true, force: true });
const result = spawnSync(
  process.execPath,
  [
    path.join(root, "node_modules/typescript/bin/tsc"),
    "-p",
    path.join(here, "tsconfig.json"),
    ...(check ? ["--noEmit"] : []),
  ],
  { stdio: "inherit" },
);
if (result.status !== 0) process.exit(result.status ?? 1);
if (!check) await fs.chmod(path.join(here, "dist/index.js"), 0o755);
