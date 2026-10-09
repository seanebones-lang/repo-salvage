/** Source-bound scoring; narrative correctness still requires manual review. */
import { createHash } from "node:crypto";
import { inspectTrace } from "../discovery-evaluation/trace.mjs";
export { inspectTrace };
const sha = (s) => createHash("sha256").update(s).digest("hex");
const valueOf = (c) =>
  c.result?.structured_content ?? c.result?.structuredContent;
const successful = (c) =>
  c.status === "completed" &&
  !c.error &&
  !(c.result?.is_error ?? c.result?.isError);
export function scoreCase(answer, trace, definition, controls) {
  const calls = trace.calls.filter(successful);
  const searched = calls.some((c) => c.tool === "repo_salvage_search_parts");
  const boundedSearch = trace.calls
    .filter((c) => c.tool === "repo_salvage_search_parts")
    .every(
      (c) =>
        Number.isInteger(c.arguments?.limit) &&
        c.arguments.limit >= 1 &&
        c.arguments.limit <= 8,
    );
  const evidence = definition.requiredEvidence.map((key) => {
    const control = controls.sources.find((s) => s.key === key);
    if (!control) throw Error("Missing pre-frozen source control.");
    const sameSource = (v) =>
      v?.source?.repository === control.repository &&
      v.source.commit === control.commit;
    const inspections = calls.filter(
      (c) =>
        c.tool === "repo_salvage_inspect_part" &&
        sameSource(valueOf(c)) &&
        valueOf(c).files?.some(
          (f) => f.path === control.path && f.git_blob_sha === control.blobSha,
        ),
    );
    const bound = (v) =>
      inspections.some((c) => {
        const i = valueOf(c);
        return (
          i.listing_id === v.listing_id &&
          (v.part_id === undefined || i.part_id === v.part_id)
        );
      });
    const readBlocks = [];
    let notice = false;
    for (const c of calls) {
      const v = valueOf(c);
      if (!sameSource(v) || !bound(v)) continue;
      if (c.tool === "repo_salvage_read_part_file") {
        if (
          v.file?.path === control.path &&
          v.file.sha256 === control.sha256 &&
          v.file.git_blob_sha === control.blobSha &&
          Number.isSafeInteger(v.offset) &&
          v.offset >= 0 &&
          v.text &&
          v.text === control.content.slice(v.offset, v.offset + v.text.length)
        )
          readBlocks.push(v.text);
        if (
          v.file?.path === control.notice.path &&
          v.file.sha256 === control.notice.sha256 &&
          v.offset === 0 &&
          v.text === control.notice.content
        )
          notice = true;
      }
      if (c.tool === "repo_salvage_focus_evidence") {
        for (const r of v.packet?.references ?? []) {
          if (
            r.path === control.path &&
            r.content &&
            sha(r.content) === r.sha256 &&
            control.content.includes(r.content)
          )
            readBlocks.push(r.content);
          if (
            r.path === control.notice.path &&
            r.content === control.notice.content &&
            r.sha256 === control.notice.sha256
          )
            notice = true;
        }
      }
    }
    const fragments = controls.cases.find((c) => c.id === definition.id)
      ?.fragments[key];
    if (!fragments?.length)
      throw Error("Missing pre-frozen behavior evidence.");
    return {
      key,
      inspected: inspections.length > 0,
      relevantSource: fragments.every((f) =>
        readBlocks.some((b) => b.includes(f)),
      ),
      notice,
    };
  });
  const exactAnswer = answer?.answer === definition.expectedAnswer;
  const sourceEvidence = evidence.every((e) => e.inspected && e.relevantSource);
  const noticeEvidence =
    definition.expectedAnswer === "NO_MATCH" || evidence.every((e) => e.notice);
  return {
    exactAnswer,
    searched,
    boundedSearch,
    sourceEvidence,
    noticeEvidence,
    evidence,
    passed:
      trace.transportSuccess &&
      exactAnswer &&
      searched &&
      boundedSearch &&
      sourceEvidence &&
      noticeEvidence,
  };
}
