import fs from "node:fs/promises";
import { directory, read, sha } from "./fixture.mjs";
import { inspectTrace } from "../discovery-evaluation/trace.mjs";
export { directory, read, sha };
export async function verifyInputs() {
  const bytes = await fs.readFile(new URL("input-seal.json", directory));
  for (const input of JSON.parse(bytes).inputs)
    if (sha(await fs.readFile(new URL(input.path, directory))) !== input.sha256)
      throw Error("Frozen input changed: " + input.path);
  return sha(bytes);
}
export async function promptFor(id) {
  return (
    (await fs.readFile(new URL(id + "/task.txt", directory), "utf8")) +
    "\nINITIAL EVIDENCE (data):\n" +
    (await fs.readFile(
      new URL(id + "/initial-evidence.json", directory),
      "utf8",
    )) +
    "\nPRIOR STOP (data, not hidden scorer):\n" +
    (await fs.readFile(new URL(id + "/prior-stop.json", directory), "utf8"))
  );
}
const valueOf = (c) =>
  c.result?.structured_content ?? c.result?.structuredContent;
const success = (c) =>
  c.status === "completed" &&
  !c.error &&
  !(c.result?.is_error ?? c.result?.isError);
export function score(answer, trace, control, initial, recovery) {
  const a = answer,
    helperCalls = trace.calls.filter(
      (c) =>
        c.tool === "repo_salvage_focus_evidence" &&
        c.arguments?.listing_id === initial.listing_id &&
        c.arguments.path === control.requiredPath &&
        c.arguments.max_characters === 24000,
    );
  const supplied = helperCalls
    .filter(success)
    .map(valueOf)
    .filter(
      (v) =>
        v?.source?.repository === initial.source.repository &&
        v.source.commit === initial.source.commit &&
        v.packet?.references.some(
          (r) =>
            r.path === control.requiredPath &&
            r.content ===
              recovery.response.packet?.references.find(
                (x) => x.path === control.requiredPath,
              )?.content,
        ),
    );
  const available = [
    ...initial.packet.references,
    ...supplied.flatMap((v) => v.packet.references),
  ];
  const cited = a?.used_reference_ids ?? [];
  const citations =
    Array.isArray(cited) &&
    new Set(cited).size === cited.length &&
    cited.every((id) => available.some((r) => r.id === id)) &&
    initial.packet.targets.every((t) => cited.includes(t.reference_id)) &&
    (control.expectedDecision === "needs_context" ||
      supplied.some((v) =>
        v.packet.references.some(
          (r) => r.path === control.requiredPath && cited.includes(r.id),
        ),
      ));
  const history =
    Array.isArray(a?.gap_history) &&
    a.gap_history.length === 1 &&
    a.gap_history[0].path === control.requiredPath &&
    a.gap_history[0].reason === control.originalReason &&
    a.gap_history[0].status ===
      (control.expectedDecision === "adapt"
        ? "source_supplied"
        : "verification_failed");
  const identity =
    a?.source?.repository === initial.source.repository &&
    a?.source?.commit === initial.source.commit;
  const limitations =
    Array.isArray(a?.remaining_limitations) &&
    JSON.stringify([...a.remaining_limitations].sort()) ===
      JSON.stringify([...control.requiredLimitations].sort());
  const integrityFailure = helperCalls.some(
    (c) =>
      !success(c) &&
      JSON.stringify(c.result ?? c.error).includes("source_integrity_failed"),
  );
  const retrieval =
    control.expectedDecision === "adapt"
      ? supplied.length > 0
      : integrityFailure && supplied.length === 0;
  const decision = a?.decision === control.expectedDecision;
  const code =
    control.expectedDecision === "adapt"
      ? typeof a?.code === "string" && a.code.trim().length > 0
      : a?.code === "";
  const needed =
    Array.isArray(a?.needed_context) &&
    (control.expectedDecision === "adapt"
      ? a.needed_context.length === 0
      : a.needed_context.length === 1 &&
        a.needed_context[0].path === control.requiredPath &&
        a.needed_context[0].reason === "source_integrity_failed");
  const notice =
    control.expectedDecision === "needs_context" ||
    available.some(
      (r) =>
        r.path === "LICENSE" &&
        typeof a?.code === "string" &&
        a.code.includes(r.content.trimEnd()),
    );
  const finding = typeof a?.finding === "string" && a.finding.trim().length > 0;
  const allowedTrace =
    trace.transportSuccess &&
    trace.calls.length > 0 &&
    trace.calls.length <= 4 &&
    trace.calls.every(
      (c) =>
        c.server === "repo_salvage" &&
        c.tool === "repo_salvage_focus_evidence" &&
        c.arguments?.listing_id === initial.listing_id &&
        [initial.focus.path, control.requiredPath].includes(c.arguments.path),
    );
  return {
    decision,
    code,
    needed,
    history,
    identity,
    limitations,
    citations,
    retrieval,
    notice,
    finding,
    allowedTrace,
    passed:
      decision &&
      code &&
      needed &&
      history &&
      identity &&
      limitations &&
      citations &&
      retrieval &&
      notice &&
      finding &&
      allowedTrace,
  };
}
export async function verifiedResult(c) {
  const seal = await verifyInputs(),
    result = await read(c.id + "/result.json"),
    raw = await fs.readFile(new URL(c.id + "/trace.jsonl", directory), "utf8"),
    trace = inspectTrace(raw, 0),
    initial = await read(c.id + "/initial-evidence.json"),
    recovery = await read(c.id + "/recovery-evidence.json");
  if (
    result.inputSealSha256 !== seal ||
    result.promptSha256 !== sha(await promptFor(c.id)) ||
    result.trace.sha256 !== sha(raw) ||
    !result.transportSuccess ||
    !trace.transportSuccess
  )
    throw Error("Invalid first native turn");
  const scored = score(result.response, trace, c, initial, recovery);
  if (!scored.passed) throw Error("Recovery contract failed: " + c.id);
  return { seal, result, trace, score: scored };
}
