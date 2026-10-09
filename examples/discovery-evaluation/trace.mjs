/** Validate completed native MCP discovery, rather than trusting a process exit. */
export const tools = [
  "repo_salvage_search_parts",
  "repo_salvage_inspect_part",
  "repo_salvage_read_part_file",
  "repo_salvage_focus_evidence",
];
export function inspectTrace(raw, code, timedOut = false) {
  let malformed = false;
  const events = raw
    .split("\n")
    .filter(Boolean)
    .flatMap((line) => {
      try {
        const e = JSON.parse(line);
        if (!e || typeof e.type !== "string") throw Error();
        return [e];
      } catch {
        malformed = true;
        return [];
      }
    });
  const items = events
    .filter((e) => e.type.startsWith("item."))
    .map((e) => e.item);
  const prohibited = items
    .filter(
      (i) =>
        !i ||
        (!["agent_message", "reasoning"].includes(i.type) &&
          !(
            i.type === "mcp_tool_call" &&
            i.server === "repo_salvage" &&
            tools.includes(i.tool)
          )),
    )
    .map((i) => i?.type ?? "unknown");
  const calls = events
    .filter(
      (e) => e.type === "item.completed" && e.item?.type === "mcp_tool_call",
    )
    .map((e) => e.item);
  const complete = events.some((e) => e.type === "turn.completed");
  const failed = events.some((e) => ["error", "turn.failed"].includes(e.type));
  const failure = timedOut
    ? "timeout"
    : malformed
      ? "malformed_trace"
      : prohibited.length
        ? "prohibited_event"
        : code !== 0
          ? "process_failed"
          : !complete || failed
            ? "incomplete_turn"
            : null;
  return {
    transportSuccess: failure === null,
    failure,
    prohibited,
    calls,
    usage: events.find((e) => e.type === "turn.completed")?.usage ?? null,
  };
}
export function scoreDiscovery(answer, trace, expected) {
  const successful = trace.calls.filter(
    (c) =>
      c.status === "completed" &&
      !c.error &&
      !(c.result?.is_error ?? c.result?.isError),
  );
  const searched = successful.some(
    (c) => c.tool === "repo_salvage_search_parts",
  );
  const inspected = successful.some(
    (c) => c.tool === "repo_salvage_inspect_part",
  );
  const read = successful.some((c) =>
    ["repo_salvage_read_part_file", "repo_salvage_focus_evidence"].includes(
      c.tool,
    ),
  );
  const exactAnswer = answer?.answer === expected;
  const sourceReadForAnswer =
    expected === "NO_MATCH"
      ? read
      : successful.some((c) => {
          const value =
            c.result?.structured_content ?? c.result?.structuredContent;
          if (c.tool === "repo_salvage_focus_evidence")
            return (
              value?.source?.repository + ":" + value?.focus?.path ===
                expected &&
              value.packet?.references?.some(
                (r) => r.path === value.focus.path && r.content,
              )
            );
          if (c.tool === "repo_salvage_read_part_file")
            return (
              value?.source?.repository + ":" + value?.file?.path ===
                expected && Boolean(value.text)
            );
          return false;
        });
  return {
    exactAnswer,
    searched,
    inspected,
    read,
    sourceReadForAnswer,
    passed:
      trace.transportSuccess &&
      exactAnswer &&
      searched &&
      inspected &&
      sourceReadForAnswer,
  };
}
