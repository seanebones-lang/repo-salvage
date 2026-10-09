/** Frozen diagnostic citation gate; source interpretation requires manual review. */
export function scoreSelection(summary, control, packet) {
  const candidate = summary.reusable_pieces.find(
    (p) => p.source_target.symbol === control.requiredSymbol,
  );
  const target = packet.targets.find(
    (t) => t.symbol === control.requiredSymbol,
  );
  const scope = packet.scoped_contexts.find((c) => c.target_id === target.id);
  const citations = control.requiredCitations.map((symbol) => {
    const ref = scope.references.find((r) => r.symbol === symbol);
    return {
      symbol,
      supplied: Boolean(ref),
      cited: Boolean(
        ref && candidate?.explanation_refs.includes(ref.reference_id),
      ),
    };
  });
  return {
    requiredSymbol: control.requiredSymbol,
    selected: Boolean(candidate),
    citations,
    fullModuleSupplied:
      packet.contexts.find((c) => c.target_id === target.id)
        .same_file_reference !== null,
    passed: Boolean(candidate) && citations.every((c) => c.supplied && c.cited),
  };
}
