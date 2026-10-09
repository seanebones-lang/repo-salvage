/** Explicit native account usage; no tool execution or catalog writes. */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { nativeRun } from "../full-chain-evaluation/run.mjs";
import { loadEngine } from "./engine.mjs";
import { loadSuite, directory, sha256 } from "./suite.mjs";
import { scoreSelection } from "./score.mjs";
export async function main(args) {
  const [mode, model, effort] = args;
  if (
    mode !== "--run" ||
    args.length !== 3 ||
    !model ||
    !["low", "medium", "high"].includes(effort)
  )
    throw Error("Explicit account use: --run MODEL low|medium|high.");
  const destination = path.join(directory, "results.json");
  if (await fs.stat(destination).catch(() => null))
    throw Error("This epoch already has results; create a new epoch.");
  const suite = await loadSuite({ production: true }),
    engine = await loadEngine();
  const results = [];
  try {
    for (const c of suite.cases) {
      const r = await nativeRun({
        model,
        effort,
        prompt: c.request.system + "\n\n" + c.request.input,
        schema: c.request.schema,
      });
      const result = {
        id: c.id,
        ...r.record,
        transportSuccess: r.trace.transportSuccess,
        failure: r.trace.failure,
        prohibitedEvents: r.trace.prohibitedEvents,
        usage: r.trace.usage,
        requestSha256: c.requestSha256,
        structurallyAccepted: false,
        response: r.answer,
        summary: null,
        selection: null,
        manualReview: "pending",
      };
      if (r.trace.transportSuccess && r.answer) {
        try {
          result.summary = engine.verifiedIndexedSummary(
            JSON.stringify(r.answer),
            c.index,
            c.packet,
          );
          result.structurallyAccepted = true;
          result.selection = scoreSelection(result.summary, c, c.packet);
        } catch {
          result.failure = "response_validation_failed";
        }
      }
      results.push(result);
      await fs.writeFile(
        destination,
        JSON.stringify(
          {
            format: "repo-salvage/scoped-support-results-v1",
            scope: suite.scope,
            inputSealSha256: sha256(
              await fs.readFile(path.join(directory, "seal.json")),
            ),
            billing: "Existing Codex account allowance; no API-key model calls",
            results,
          },
          null,
          2,
        ) + "\n",
      );
      console.log(
        JSON.stringify({
          id: c.id,
          output: r.output,
          structurallyAccepted: result.structurallyAccepted,
          selection: result.selection,
          failure: result.failure,
        }),
      );
      if (!r.trace.transportSuccess) break;
    }
  } finally {
    await engine.close();
  }
  if (
    results.length !== suite.cases.length ||
    results.some((r) => !r.structurallyAccepted || !r.selection?.passed)
  )
    process.exitCode = 1;
}
if (process.argv[1] === fileURLToPath(import.meta.url))
  await main(process.argv.slice(2));
