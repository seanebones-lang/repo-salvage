import {
  getPublicOwnedRepoFresh,
  indexedSnapshotRepo,
  lastHumanCommit,
  type RepoSnapshot,
  type GhRepo,
} from "./github";
import { summarizeRepo } from "./summarize";
import {
  anthropicProvider,
  type AnalysisProvider,
  type AnalysisResponse,
} from "./analysis-provider";
import {
  claimNextJob,
  renewJob,
  recoverJobs,
  saveJobField,
  markProviderStarted,
  publishJob,
  finishJob,
  jobById,
  type AnalysisJob,
} from "./analysis-jobs";
import type { finishAnalysis } from "./db";

type Checkpoint = { repo: GhRepo; snap: RepoSnapshot; last: string | null };
export async function executeJob(
  job: AnalysisJob,
  provider: AnalysisProvider = anthropicProvider,
) {
  const heartbeat = setInterval(() => {
    try {
      renewJob(job);
    } catch {
      /* A lost lease prevents all subsequent writes. */
    }
  }, 10_000);
  heartbeat.unref();
  let stage = "verification";
  try {
    let current = await getPublicOwnedRepoFresh(job.repo_id, job.owner_id);
    if (!renewJob(job)) throw Error("Canceled");
    let checkpoint: Checkpoint;
    if (job.checkpoint_json) checkpoint = JSON.parse(job.checkpoint_json);
    else {
      stage = "inspection";
      const [snap, last] = await Promise.all([
        indexedSnapshotRepo("", current, job.source_sha),
        lastHumanCommit("", current, job.source_sha),
      ]);
      // Only supplied source bodies are needed to validate/replay interpretation.
      // Keep full index metadata/counts but discard unsupplied reference bodies.
      if (snap.index && snap.packet) {
        snap.index.references = snap.packet.references;
        snap.files = [];
        snap.tree = [];
        snap.knownPaths = [];
      }
      checkpoint = { repo: current, snap, last };
      saveJobField(job, "checkpoint_json", checkpoint, "inspecting");
    }
    stage = "verification";
    current = await getPublicOwnedRepoFresh(job.repo_id, job.owner_id);
    if (!renewJob(job)) throw Error("Canceled");
    let result: Parameters<typeof finishAnalysis>[1];
    if (job.result_json) result = JSON.parse(job.result_json);
    else {
      const savedResponse = job.response_json
        ? (JSON.parse(job.response_json) as AnalysisResponse)
        : null;
      const durableProvider: AnalysisProvider = {
        generate: async (request) => {
          if (savedResponse) return savedResponse;
          const pinnedRequest = { ...request, model: job.model };
          if (!markProviderStarted(job, pinnedRequest))
            throw Error("Provider intent already recorded or job canceled");
          stage = "provider";
          const response = await provider.generate(pinnedRequest);
          stage = "response_storage";
          saveJobField(job, "response_json", response, "generating");
          stage = "validation";
          return response;
        },
      };
      stage = "validation";
      const { summary, model } = await summarizeRepo(
        checkpoint.repo,
        checkpoint.snap,
        job.note,
        durableProvider,
      );
      result = {
        github_repo_id: job.repo_id,
        owner_id: job.owner_id,
        owner_login: current.owner.login,
        name: current.name,
        full_name: current.full_name,
        url: current.html_url,
        description: current.description,
        language: current.language,
        stars: current.stargazers_count,
        forks: current.forks_count,
        license: current.license!.spdx_id,
        last_human_commit: checkpoint.last,
        owner_note: job.note,
        summary,
        source_sha: job.source_sha,
        analyzed_at: new Date().toISOString(),
        summary_model: model,
      };
      saveJobField(job, "result_json", result, "publishing");
    }
    stage = "publication";
    current = await getPublicOwnedRepoFresh(job.repo_id, job.owner_id);
    // A rename must use the current numeric repository identity, not a stale slug.
    Object.assign(result, {
      owner_login: current.owner.login,
      name: current.name,
      full_name: current.full_name,
      url: current.html_url,
      license: current.license!.spdx_id,
    });
    if (!publishJob(job, result)) throw Error("Canceled");
  } catch (error) {
    const row = jobById(job.id, job.owner_id);
    if (!row) return;
    if (
      row.provider_started_at !== null &&
      !row.response_json &&
      !row.result_json
    ) {
      const status = (error as { status?: number })?.status;
      if (
        stage === "provider" &&
        typeof status === "number" &&
        [400, 401, 403, 404, 413, 422, 429].includes(status)
      )
        finishJob(
          job,
          "failed",
          "provider_rejected",
          "The provider rejected this request. Check provider configuration and allowances before starting a new attempt.",
        );
      else
        finishJob(
          job,
          "needs_attention",
          "provider_outcome_unknown",
          "The provider request ended without a saved response. It may have been charged. No automatic retry was made.",
        );
    } else if (!renewJob(job))
      finishJob(
        job,
        row.deadline <= Date.now() ? "failed" : "canceled",
        row.deadline <= Date.now() ? "job_expired" : "canceled",
        row.deadline <= Date.now()
          ? "This job exceeded its one-day queue lifetime. Start a new attempt when ready."
          : "Publication was canceled or authorization changed.",
      );
    else
      finishJob(
        job,
        "failed",
        stage === "validation"
          ? "invalid_response"
          : stage === "inspection"
            ? "inspection_failed"
            : "verification_failed",
        stage === "validation"
          ? "The analysis response did not pass evidence validation. Your existing listing was preserved."
          : stage === "inspection"
            ? "Source inspection failed. Your existing listing was preserved."
            : "Current public ownership or publication could not be verified. Your existing listing was preserved.",
      );
  } finally {
    clearInterval(heartbeat);
  }
}
export async function runNextJob(provider?: AnalysisProvider) {
  const job = claimNextJob();
  if (!job) return null;
  await executeJob(job, provider);
  return jobById(job.id, job.owner_id);
}
const globalWorker = globalThis as unknown as {
  __analysisWorker?: { timer: NodeJS.Timeout; busy: boolean; lastTick: number };
};
export function startAnalysisWorker() {
  if (globalWorker.__analysisWorker) return;
  recoverJobs();
  const state = {
    timer: null as unknown as NodeJS.Timeout,
    busy: false,
    lastTick: Date.now(),
  };
  globalWorker.__analysisWorker = state;
  const tick = async () => {
    state.lastTick = Date.now();
    if (state.busy) return;
    state.busy = true;
    try {
      recoverJobs();
      if (process.env.ANTHROPIC_API_KEY) await runNextJob();
    } catch {
      console.error("repo-salvage analysis worker: queue unavailable");
    } finally {
      state.busy = false;
      state.lastTick = Date.now();
    }
  };
  state.timer = setInterval(() => {
    void tick();
  }, 2000);
  state.timer.unref();
  void tick();
  console.info("repo-salvage analysis worker: started");
}
