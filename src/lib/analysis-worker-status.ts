/** Worker state is shared across the Node instrumentation and route bundles. */
export function analysisWorkerStatus(now = Date.now()) {
  if (process.env.ANALYSIS_WORKER_ENABLED !== "1") return "disabled" as const;
  const state = (
    globalThis as unknown as { __analysisWorker?: { lastTick: number } }
  ).__analysisWorker;
  return state && now - state.lastTick < 30_000
    ? ("ready" as const)
    : ("unavailable" as const);
}
