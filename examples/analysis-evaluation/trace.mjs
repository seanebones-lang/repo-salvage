/** A successful process alone is insufficient evidence of a tool-free completed turn. */
export function inspectCodexTrace(raw, code, timedOut = false) {
  let malformed = false;
  const events = raw
    .split("\n")
    .filter(Boolean)
    .flatMap((line) => {
      try {
        const event = JSON.parse(line);
        if (
          !event ||
          typeof event !== "object" ||
          Array.isArray(event) ||
          typeof event.type !== "string"
        )
          throw Error("Invalid event record.");
        return [event];
      } catch {
        malformed = true;
        return [];
      }
    });
  const prohibitedEvents = events
    .filter(
      (e) =>
        ["item.started", "item.updated", "item.completed"].includes(e.type) &&
        !["agent_message", "reasoning"].includes(e.item?.type),
    )
    .map((e) => e.item?.type ?? "unknown");
  const completed = events.some((e) => e.type === "turn.completed");
  const failed = events.some((e) => ["error", "turn.failed"].includes(e.type));
  const failure = timedOut
    ? "cli_timeout"
    : malformed
      ? "malformed_cli_trace"
      : prohibitedEvents.length
        ? "prohibited_tool_event"
        : code !== 0
          ? "cli_failed"
          : !completed || failed
            ? "incomplete_cli_turn"
            : null;
  return {
    transportSuccess: failure === null,
    failure,
    prohibitedEvents,
    usage: events.find((e) => e.type === "turn.completed")?.usage ?? null,
  };
}
