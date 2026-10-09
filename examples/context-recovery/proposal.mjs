/** Four fresh sessions carrying earlier stop records; actual installed MCP transport, no source execution. */
import fs from "node:fs/promises";
import { nativeRun } from "./native.mjs";
import { serveCase } from "./fixture.mjs";
import {
  directory,
  read,
  sha,
  verifyInputs,
  promptFor,
  score,
} from "./suite.mjs";
const [mode, model, effort] = process.argv.slice(2);
if (
  mode !== "--run" ||
  process.argv.length !== 5 ||
  !model ||
  !["low", "medium", "high"].includes(effort)
)
  throw Error("Use --run MODEL EFFORT with account authorization");
const seal = await verifyInputs(),
  controls = await read("controls.json");
for (const c of controls)
  if (
    await fs.stat(new URL(c.id + "/result.json", directory)).catch(() => null)
  )
    throw Error("First results already retained; create a new epoch");
for (const c of controls) {
  const server = await serveCase(c.id);
  let r;
  try {
    r = await nativeRun({
      model,
      effort,
      prompt: await promptFor(c.id),
      schema: await read("schema.json"),
      origin: server.origin,
    });
  } finally {
    await server.close();
  }
  await fs.writeFile(new URL(c.id + "/trace.jsonl", directory), r.raw, {
    flag: "wx",
  });
  await fs.writeFile(
    new URL(c.id + "/requests.json", directory),
    JSON.stringify(server.requests, null, 2) + "\n",
    { flag: "wx" },
  );
  const result = {
    ...r.record,
    inputSealSha256: seal,
    transportSuccess: r.trace.transportSuccess,
    failure: r.trace.failure,
    prohibitedEvents: r.trace.prohibited,
    usage: r.trace.usage,
    response: r.answer,
    review: "pending",
    execution: "not_run",
  };
  await fs.writeFile(
    new URL(c.id + "/result.json", directory),
    JSON.stringify(result, null, 2) + "\n",
    { flag: "wx" },
  );
  if (r.answer?.code)
    await fs.writeFile(
      new URL(
        c.id + "/consumer." + (c.language === "rust" ? "rs" : "go"),
        directory,
      ),
      r.answer.code,
      { flag: "wx" },
    );
  console.log(
    JSON.stringify({
      id: c.id,
      decision: r.answer?.decision,
      score: score(
        r.answer,
        r.trace,
        c,
        await read(c.id + "/initial-evidence.json"),
        await read(c.id + "/recovery-evidence.json"),
      ),
      usage: r.trace.usage,
    }),
  );
  if (!r.trace.transportSuccess)
    throw Error("Native transport failed; retained");
}
