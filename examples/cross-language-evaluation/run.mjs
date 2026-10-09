/** Explicit native account use; separate sessions and no upstream execution. */
import fs from "node:fs/promises";
import path from "node:path";
import { nativeRun } from "../full-chain-evaluation/run.mjs";
import { runNativeTrials } from "../competing-discovery-evaluation/host.mjs";
import { loadEngine } from "./engine.mjs";
import { loadSuite, loadGenerated, directory, sha256 } from "./suite.mjs";
const [phase, a, b, c] = process.argv.slice(2),
  model = phase === "--discover" ? b : a,
  effort = phase === "--discover" ? c : b;
if (
  !["--analyze", "--discover"].includes(phase) ||
  process.argv.length !== (phase === "--discover" ? 6 : 5) ||
  !model ||
  !["low", "medium", "high"].includes(effort)
)
  throw Error(
    "Explicit account use: --analyze MODEL EFFORT or --discover LOOPBACK_ORIGIN MODEL EFFORT",
  );
const filename = path.join(
  directory,
  phase === "--analyze" ? "analysis-results.json" : "discovery-results.json",
);
if (await fs.stat(filename).catch(() => null))
  throw Error("Epoch already has results; create a new epoch");
if (phase === "--discover") {
  if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(a) || a.endsWith(":3187"))
    throw Error("Disposable loopback origin required");
  const s = await loadGenerated();
  const r = await runNativeTrials({ ...s, origin: a, model, effort });
  const record = JSON.parse(
    await fs.readFile(path.join(r.output, "results.json"), "utf8"),
  );
  await fs.writeFile(
    filename,
    JSON.stringify({ ...record, manualReview: "pending" }, null, 2) + "\n",
    { flag: "wx" },
  );
  console.log(
    JSON.stringify({
      output: r.output,
      completed: r.results.length,
      passed: r.results.filter((r) => r.score.passed).length,
    }),
  );
} else {
  const s = await loadSuite(),
    engine = await loadEngine({ historical: true }),
    results = [];
  try {
    for (const a of s.analyses) {
      const r = await nativeRun({
        model,
        effort,
        prompt: a.request.system + "\n\n" + a.request.input,
        schema: a.request.schema,
      });
      const result = {
        repository: a.repository,
        ...r.record,
        requestSha256: a.requestSha256,
        transportSuccess: r.trace.transportSuccess,
        failure: r.trace.failure,
        prohibitedEvents: r.trace.prohibitedEvents,
        usage: r.trace.usage,
        response: r.answer,
        summary: null,
        structurallyAccepted: false,
        manualReview: "pending",
      };
      if (r.trace.transportSuccess && r.answer)
        try {
          result.summary = engine.verifiedIndexedSummary(
            JSON.stringify(r.answer),
            a.index,
            a.packet,
          );
          result.structurallyAccepted = true;
        } catch {
          result.failure = "response_validation_failed";
        }
      results.push(result);
      await fs.writeFile(
        filename,
        JSON.stringify(
          {
            format: "repo-salvage/cross-language-analysis-v1",
            inputSealSha256: sha256(s.sealBytes),
            scope: s.suite.scope,
            results,
          },
          null,
          2,
        ) + "\n",
      );
      console.log(
        JSON.stringify({
          repository: a.repository,
          output: r.output,
          accepted: result.structurallyAccepted,
          selected: result.summary?.reusable_pieces.map((p) => [
            p.path,
            p.source_target.symbol,
          ]),
          failure: result.failure,
        }),
      );
      if (!r.trace.transportSuccess) break;
    }
  } finally {
    await engine.close();
  }
  if (results.length !== 4 || results.some((r) => !r.structurallyAccepted))
    process.exitCode = 1;
}
