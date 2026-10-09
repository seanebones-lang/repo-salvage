/** Load trusted application modules for an operator evaluation; never load target source. */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import ts from "typescript";
export const root = fileURLToPath(new URL("../../", import.meta.url));
export async function loadEngine() {
  const temp = await fs.mkdtemp(
    path.join(os.tmpdir(), "salvage-analysis-engine-"),
  );
  await fs.symlink(
    path.join(root, "node_modules"),
    path.join(temp, "node_modules"),
    "dir",
  );
  for (const name of [
    "python-parser",
    "source-selection",
    "source-index",
    "components",
    "analysis-provider",
    "summarize",
    "http",
    "github",
  ]) {
    const source = await fs.readFile(
      path.join(root, "src/lib", name + ".ts"),
      "utf8",
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
    close: () => fs.rm(temp, { recursive: true, force: true }),
  };
}
