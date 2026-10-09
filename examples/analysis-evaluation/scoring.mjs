/** Expectations never enter a provider request. Path and symbol jointly identify a target. */
export const targetKey = (target) => `${target.path}#${target.symbol}`;
export function scoreSelection(response, summary, expectation) {
  const selected = summary.reusable_pieces.map((p) =>
    targetKey(p.source_target),
  );
  const allowed = new Set(expectation.allowedTargets);
  const unexpected = selected.filter((t) => !allowed.has(t));
  const missingGroups = expectation.requiredGroups.filter(
    (group) => !group.some((target) => selected.includes(target)),
  );
  const outcomeMatches = response.outcome === expectation.outcome;
  const countMatches =
    selected.length >= expectation.minCandidates &&
    selected.length <= expectation.maxCandidates;
  return {
    passed:
      outcomeMatches &&
      countMatches &&
      unexpected.length === 0 &&
      missingGroups.length === 0 &&
      new Set(selected).size === selected.length,
    selected,
    unexpected,
    missingGroups,
    outcomeMatches,
    countMatches,
    precision: selected.length
      ? (selected.length - unexpected.length) / selected.length
      : null,
    requiredGroupRecall: expectation.requiredGroups.length
      ? 1 - missingGroups.length / expectation.requiredGroups.length
      : null,
  };
}
