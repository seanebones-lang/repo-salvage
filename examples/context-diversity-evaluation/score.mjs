/** Selection breadth controls; source prose correctness remains a manual gate. */
export function scoreSelection(summary, definition, packet) {
  const symbols = summary.reusable_pieces.map((p) => p.source_target.symbol);
  const groups = Object.entries(definition.groups)
    .filter(([, members]) => members.some((s) => symbols.includes(s)))
    .map(([name]) => name);
  const redundantPairs = definition.wrapperPairs.filter((pair) =>
    pair.every((s) => symbols.includes(s)),
  );
  const requiredSelected = definition.requiredSymbols.every((s) =>
    symbols.includes(s),
  );
  const context = definition.requiredSymbols.map((symbol) => {
    const target = packet.targets.find((t) => t.symbol === symbol),
      ctx = packet.contexts.find((c) => c.target_id === target?.id),
      piece = summary.reusable_pieces.find(
        (p) => p.source_target.symbol === symbol,
      );
    return {
      symbol,
      supplied: !!target,
      sameFileContext: !!ctx?.same_file_reference,
      contextCited:
        !!ctx?.same_file_reference &&
        !!piece?.explanation_refs.includes(ctx.same_file_reference),
    };
  });
  const enoughGroups = groups.length >= definition.minimumGroups;
  const redundancyWithinLimit =
    redundantPairs.length <= definition.maxRedundantPairs;
  return {
    symbols,
    groups,
    redundantPairs,
    requiredSelected,
    enoughGroups,
    redundancyWithinLimit,
    context,
    passed: requiredSelected && enoughGroups && redundancyWithinLimit,
  };
}
