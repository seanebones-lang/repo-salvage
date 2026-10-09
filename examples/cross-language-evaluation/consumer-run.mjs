/** Isolated, tool-free proposal and separate acceptance; refuses reruns. */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { nativeRun } from "../full-chain-evaluation/run.mjs";
import { directory, read, sha256, verifySeal } from "./suite.mjs";
const [mode, model, effort] = process.argv.slice(2);
if (
  mode !== "--run" ||
  process.argv.length !== 5 ||
  !model ||
  !["low", "medium", "high"].includes(effort)
)
  throw Error("Explicit account use: --run MODEL EFFORT");
const destination = path.join(directory, "consumer-results.json");
if (await fs.stat(destination).catch(() => null))
  throw Error("Consumer epoch already has results");
const { bytes } = await verifySeal("consumer-input-seal.json");
const task = await read("consumer-task.json"),
  evidence = await read("consumer-evidence.json");
const schema = {
  type: "object",
  properties: { code: { type: "string" }, finding: { type: "string" } },
  required: ["code", "finding"],
  additionalProperties: false,
};
const r = await nativeRun({
  model,
  effort,
  prompt:
    task.instructions +
    "\n\n" +
    task.question +
    "\n\n" +
    JSON.stringify(evidence),
  schema,
});
const result = {
  ...r.record,
  inputSealSha256: sha256(bytes),
  transportSuccess: r.trace.transportSuccess,
  failure: r.trace.failure,
  prohibitedEvents: r.trace.prohibitedEvents,
  usage: r.trace.usage,
  response: r.answer,
  manualReview: "pending",
  execution: "not_run",
};
await fs.writeFile(destination, JSON.stringify(result, null, 2) + "\n", {
  flag: "wx",
});
if (!r.trace.transportSuccess || !r.answer?.code)
  throw Error("Native proposal failed; retained at " + r.output);
await fs.writeFile(path.join(directory, "consumer.mjs"), r.answer.code, {
  flag: "wx",
});
// Execute only the inspected proposed adaptation, never captured upstream modules.
console.log(
  JSON.stringify({
    output: r.output,
    codeSha256: sha256(r.answer.code),
    next: "Review source and run isolated acceptance separately",
  }),
);
