/** Load trusted application modules for an operator evaluation; never load target source. */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import ts from "typescript";
import { createHash } from "node:crypto";
export const root = fileURLToPath(new URL("../../", import.meta.url));
const moduleNames = [
  "agent-error",
  "focused-evidence",
  "python-parser",
  "source-selection",
  "source-index",
  "components",
  "analysis-provider",
  "summarize",
  "http",
  "github",
];
export async function loadEngine({ historical = false } = {}) {
  // Only this repository-owned archive is executable. Target captures never enter
  // this loader; they remain parser input data.
  let archive;
  if (historical) {
    if (historical !== true) throw Error("Unknown trusted historical engine.");
    const bytes = await fs.readFile(
      new URL("./history/engine.json", import.meta.url),
    );
    const seal = JSON.parse(
      await fs.readFile(
        new URL("./history/seal.json", import.meta.url),
        "utf8",
      ),
    );
    const digest = (b) => createHash("sha256").update(b).digest("hex");
    if (digest(bytes) !== seal.sha256)
      throw Error("Trusted historical engine changed.");
    archive = JSON.parse(bytes);
    if (
      archive.format !== "repo-salvage/trusted-engine-archive-v1" ||
      JSON.stringify(archive.modules.map((m) => m.name)) !==
        JSON.stringify(moduleNames) ||
      archive.modules.some((m) => digest(m.source) !== m.sha256) ||
      digest(archive.parser.source) !== archive.parser.sha256
    )
      throw Error("Invalid trusted historical engine.");
  }
  const temp = await fs.mkdtemp(
    path.join(os.tmpdir(), "salvage-analysis-engine-"),
  );
  await fs.symlink(
    path.join(root, "node_modules"),
    path.join(temp, "node_modules"),
    "dir",
  );
  if (archive)
    await fs.writeFile(
      path.join(temp, "python-index.py"),
      archive.parser.source,
    );
  for (const name of moduleNames) {
    let source = archive
      ? archive.modules.find((m) => m.name === name).source
      : await fs.readFile(path.join(root, "src/lib", name + ".ts"), "utf8");
    if (archive && name === "python-parser")
      source = source.replace(
        'path.resolve("scripts/python-index.py")',
        JSON.stringify(path.join(temp, "python-index.py")),
      );
    const output = ts
      .transpileModule(source, {
        compilerOptions: {
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2022,
        },
      })
      .outputText.replace(/from "\.\/([^\"]+)"/g, 'from "./$1.mjs"');
    await fs.writeFile(path.join(temp, name + ".mjs"), output);
  }
  return {
    ...(await import(pathToFileURL(path.join(temp, "source-index.mjs")))),
    ...(await import(pathToFileURL(path.join(temp, "summarize.mjs")))),
    ...(await import(pathToFileURL(path.join(temp, "github.mjs")))),
    ...(await import(pathToFileURL(path.join(temp, "focused-evidence.mjs")))),
    close: () => fs.rm(temp, { recursive: true, force: true }),
  };
}
