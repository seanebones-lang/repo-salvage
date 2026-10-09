/** Six separate tool-free first-response trials; no hidden controls or acceptance in prompts. */
import fs from "node:fs/promises";
import { nativeRun } from "../full-chain-evaluation/run.mjs";
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
  cases = (await read("corpus.json")).cases;
for (const c of cases)
  if (
    await fs.stat(new URL(c.id + "/result.json", directory)).catch(() => null)
  )
    throw Error(
      "Epoch already has a result; preserve it and create a new epoch",
    );
for (const c of cases) {
  const r = await nativeRun({
    model,
    effort,
    prompt: await promptFor(c.id),
    schema: await read("schema.json"),
  });
  await fs.writeFile(new URL(c.id + "/trace.jsonl", directory), r.raw, {
    flag: "wx",
  });
  await fs.writeFile(
    new URL(c.id + "/result.json", directory),
    JSON.stringify(
      {
        ...r.record,
        inputSealSha256: seal,
        transportSuccess: r.trace.transportSuccess,
        failure: r.trace.failure,
        prohibitedEvents: r.trace.prohibitedEvents,
        usage: r.trace.usage,
        response: r.answer,
        review: "pending",
        execution: "not_run",
      },
      null,
      2,
    ) + "\n",
    { flag: "wx" },
  );
  if (typeof r.answer?.code === "string" && r.answer.code.length)
    await fs.writeFile(
      new URL(
        c.id + "/consumer." + (c.language === "rust" ? "rs" : "go"),
        directory,
      ),
      r.answer.code,
      { flag: "wx" },
    );
  const control = (await read("controls.json")).find((x) => x.id === c.id);
  console.log(
    JSON.stringify({
      id: c.id,
      transportSuccess: r.trace.transportSuccess,
      decision: r.answer?.decision,
      score: score(r.answer, control, await read(c.id + "/evidence.json")),
      usage: r.trace.usage,
    }),
  );
  if (!r.trace.transportSuccess)
    throw Error("Transport failed; exact first response retained");
}
