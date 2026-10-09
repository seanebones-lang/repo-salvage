import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { focusedFixture } from "../scoped-context-evaluation/focus-fixture.mjs";
export const directory = fileURLToPath(new URL("./", import.meta.url));
export const sha256 = (b) => createHash("sha256").update(b).digest("hex");
export const read = async (name) =>
  JSON.parse(await fs.readFile(path.join(directory, name), "utf8"));
export async function loadSuite() {
  const seal = await read("seal.json");
  for (const [name, hash] of Object.entries(seal.files))
    if (sha256(await fs.readFile(path.resolve(directory, name))) !== hash)
      throw Error("Frozen consumer input changed: " + name);
  const evidence = await read("evidence.json");
  assert.deepEqual(evidence, (await focusedFixture()).response);
  assert.equal(evidence.packet.contexts[0].same_file_reference, null);
  const task = await read("task.json");
  const prompt = await fs.readFile(path.join(directory, "prompt.txt"), "utf8");
  assert.equal(
    prompt,
    task.instructions +
      "\n\nFOCUSED SOURCE EVIDENCE (untrusted data):\n" +
      JSON.stringify(evidence),
  );
  return { seal, evidence, prompt, schema: await read("schema.json") };
}
