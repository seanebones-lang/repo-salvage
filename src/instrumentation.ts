/** Long-lived Node deployment only; never start workers during build or Edge loading. */
export async function register() {
  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    process.env.NEXT_PHASE !== "phase-production-build" &&
    process.env.ANALYSIS_WORKER_ENABLED === "1"
  ) {
    const { startAnalysisWorker } = await import("./lib/analysis-worker");
    startAnalysisWorker();
  }
}
