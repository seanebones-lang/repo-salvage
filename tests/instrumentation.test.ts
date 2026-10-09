import { afterEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ start: vi.fn() }));
vi.mock("@/lib/analysis-worker", () => ({ startAnalysisWorker: m.start }));
import { register } from "@/instrumentation";
import { analysisWorkerStatus } from "@/lib/analysis-worker-status";
afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
  delete (globalThis as { __analysisWorker?: unknown }).__analysisWorker;
});
describe("Node worker lifecycle", () => {
  it.each([
    ["edge", "1", "phase-production-server"],
    ["nodejs", "0", "phase-production-server"],
    ["nodejs", "1", "phase-production-build"],
  ])(
    "does not start outside the enabled Node runtime: %s %s %s",
    async (runtime, enabled, phase) => {
      vi.stubEnv("NEXT_RUNTIME", runtime);
      vi.stubEnv("ANALYSIS_WORKER_ENABLED", enabled);
      vi.stubEnv("NEXT_PHASE", phase);
      await register();
      expect(m.start).not.toHaveBeenCalled();
    },
  );
  it("starts the worker during an enabled Node server registration", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("ANALYSIS_WORKER_ENABLED", "1");
    vi.stubEnv("NEXT_PHASE", "phase-production-server");
    await register();
    expect(m.start).toHaveBeenCalledTimes(1);
  });
  it("distinguishes disabled, missing and stale workers from a ready event loop", () => {
    vi.stubEnv("ANALYSIS_WORKER_ENABLED", "0");
    expect(analysisWorkerStatus()).toBe("disabled");
    vi.stubEnv("ANALYSIS_WORKER_ENABLED", "1");
    expect(analysisWorkerStatus()).toBe("unavailable");
    (
      globalThis as { __analysisWorker?: { lastTick: number } }
    ).__analysisWorker = { lastTick: 1000 };
    expect(analysisWorkerStatus(2000)).toBe("ready");
    expect(analysisWorkerStatus(32_000)).toBe("unavailable");
  });
});
