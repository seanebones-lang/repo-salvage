/** Explicit native account use; first result is preserved, with no automatic execution. */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { nativeRun } from "../full-chain-evaluation/adapt.mjs";
import { directory, read, sha256, loadSuite } from "./suite.mjs";
export async function main(args) {
  const [mode, model, effort] = args;
  if (
    mode !== "--run" ||
    args.length !== 3 ||
    !model ||
    !["low", "medium", "high"].includes(effort)
  )
    throw Error("Explicit account use required: --run MODEL EFFORT.");
  if (await fs.stat(path.join(directory, "results.json")).catch(() => null))
    throw Error("Epoch already has results; do not overwrite.");
  const s = await loadSuite();
  const r = await nativeRun({
    model,
    effort,
    prompt: s.prompt,
    schema: s.schema,
  });
  const a = r.answer;
  const required = (await read("controls.json")).requiredCitations;
  const references = new Set(s.evidence.packet.references.map((x) => x.id));
  const citationsPass =
    Array.isArray(a?.citations) &&
    required.every((id) => a.citations.includes(id)) &&
    a.citations.every((id) => references.has(id));
  const notice = await fs.readFile(
    new URL("../integer-word-consumer/LICENSE", import.meta.url),
    "utf8",
  );
  const noticePass =
    typeof a?.code === "string" && a.code.includes(notice.trimEnd());
  const result = {
    ...r.record,
    inputSealSha256: sha256(
      await fs.readFile(path.join(directory, "seal.json")),
    ),
    usage: r.trace.usage,
    transportSuccess: r.trace.transportSuccess,
    failure: r.trace.failure,
    prohibitedEvents: r.trace.prohibitedEvents,
    response: a,
    codeSha256: sha256(a?.code ?? ""),
    citationsPass,
    noticePass,
    manualReview: "pending",
    consumerExecution: "not-run",
  };
  await fs.writeFile(
    path.join(directory, "results.json"),
    JSON.stringify(result, null, 2) + "\n",
    { flag: "wx" },
  );
  console.log(
    JSON.stringify({
      output: r.output,
      transportSuccess: result.transportSuccess,
      citationsPass,
      noticePass,
      codeSha256: result.codeSha256,
    }),
  );
  if (!result.transportSuccess || !citationsPass || !noticePass)
    process.exitCode = 1;
}
if (process.argv[1] === fileURLToPath(import.meta.url))
  await main(process.argv.slice(2));
