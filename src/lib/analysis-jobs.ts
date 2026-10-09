import { createHash, randomUUID } from "node:crypto";
import {
  db,
  beginAnalysis,
  analysisBaseline,
  analysisIsActive,
  releaseAnalysis,
  finishAnalysis,
  type Listing,
} from "./db";
import {
  claimDraft,
  draftAnalysisActive,
  publishDraft,
  resetDraftAnalysis,
} from "./contributions";

export const JOB_LEASE_MS = 60_000;
export const JOB_DEADLINE_MS = 86_400_000;
export type JobStatus =
  | "queued"
  | "inspecting"
  | "generating"
  | "publishing"
  | "needs_attention"
  | "succeeded"
  | "failed"
  | "canceled";
export type AnalysisJob = {
  id: string;
  owner_id: number;
  repo_id: number;
  repo_name: string;
  source_sha: string;
  note: string | null;
  draft_id: string | null;
  request_key: string;
  payload_hash: string;
  analysis_token: string;
  model: string;
  status: JobStatus;
  created_at: number;
  updated_at: number;
  deadline: number;
  lease_token: string | null;
  lease_expires_at: number | null;
  inspection_attempts: number;
  provider_started_at: number | null;
  request_hash: string | null;
  checkpoint_json: string | null;
  response_json: string | null;
  result_json: string | null;
  error_code: string | null;
  error_message: string | null;
  listing_id: number | null;
};
export const activeJobStatuses = [
  "queued",
  "inspecting",
  "generating",
  "publishing",
] as const;
export const payloadHash = (
  repoId: number,
  note: string | null,
  draftId: string | null,
) =>
  createHash("sha256")
    .update(JSON.stringify([repoId, note, draftId]))
    .digest("hex");
export function jobById(id: string, ownerId: number): AnalysisJob | null {
  return (
    (db()
      .prepare("SELECT * FROM analysis_jobs WHERE id = ? AND owner_id = ?")
      .get(id, ownerId) as AnalysisJob) ?? null
  );
}
export function jobForKey(ownerId: number, key: string): AnalysisJob | null {
  return (
    (db()
      .prepare(
        `SELECT j.* FROM analysis_jobs j WHERE j.owner_id = ? AND
        (j.request_key = ? OR EXISTS (SELECT 1 FROM analysis_job_requests r WHERE r.job_id = j.id AND r.owner_id = j.owner_id AND r.request_key = ?))`,
      )
      .get(ownerId, key, key) as AnalysisJob) ?? null
  );
}
/** Keep refreshed-form retries idempotent even after the reused active job finishes. */
function recordRequest(jobId: string, ownerId: number, key: string) {
  const count = db()
    .prepare("SELECT COUNT(*) AS n FROM analysis_job_requests WHERE job_id = ?")
    .get(jobId) as { n: number };
  if (count.n >= 32)
    throw Error(
      "Too many repeated submissions. Open this repository's progress from your analysis jobs.",
    );
  db()
    .prepare(
      "INSERT INTO analysis_job_requests (owner_id,request_key,job_id) VALUES (?,?,?)",
    )
    .run(ownerId, key, jobId);
}
export function jobsForOwner(ownerId: number) {
  return db()
    .prepare(
      "SELECT * FROM analysis_jobs WHERE owner_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 50",
    )
    .all(ownerId) as AnalysisJob[];
}
export function publicJob(job: AnalysisJob) {
  return {
    id: job.id,
    repo_id: job.repo_id,
    repo_name: job.repo_name,
    source_sha: job.source_sha,
    status: job.status,
    model: job.model,
    created_at: job.created_at,
    updated_at: job.updated_at,
    inspection_attempts: job.inspection_attempts,
    provider_started: job.provider_started_at !== null,
    error_code: job.error_code,
    error_message: job.error_message,
    listing_id: job.listing_id,
  };
}
export function enqueueAnalysis(input: {
  ownerId: number;
  repoId: number;
  repoName: string;
  sourceSha: string;
  note: string | null;
  draftId: string | null;
  key: string;
  model: string;
  baseline: ReturnType<typeof analysisBaseline>;
}) {
  return db().transaction(() => {
    const hash = payloadHash(input.repoId, input.note, input.draftId);
    const existing = jobForKey(input.ownerId, input.key);
    if (existing) {
      if (existing.payload_hash !== hash)
        throw Error(
          "This request key belongs to different analysis context. Refresh before submitting.",
        );
      return existing;
    }
    // A lost enqueue response followed by a page refresh must not create a
    // second active run, even when the refreshed form has a different nonce.
    const running = db()
      .prepare(
        "SELECT * FROM analysis_jobs WHERE repo_id = ? AND status IN ('queued','inspecting','generating','publishing')",
      )
      .get(input.repoId) as AnalysisJob | undefined;
    if (running) {
      if (
        running.owner_id === input.ownerId &&
        running.payload_hash === hash &&
        running.source_sha === input.sourceSha
      ) {
        recordRequest(running.id, input.ownerId, input.key);
        return running;
      }
      throw Error(
        "This repository already has an analysis in progress. Open its progress page first.",
      );
    }
    const counts = db()
      .prepare(
        "SELECT COUNT(*) AS total, SUM(owner_id = ?) AS owned FROM analysis_jobs WHERE status IN ('queued','inspecting','generating','publishing')",
      )
      .get(input.ownerId) as { total: number; owned: number | null };
    if (counts.total >= 20 || (counts.owned ?? 0) >= 2)
      throw Error(
        "The analysis queue is full. Wait for an existing job to finish.",
      );
    const token = input.draftId
      ? claimDraft(
          input.draftId,
          input.ownerId,
          input.repoId,
          input.sourceSha,
          input.baseline,
        )
      : beginAnalysis(input.repoId, input.ownerId, input.baseline);
    const now = Date.now(),
      id = randomUUID();
    db()
      .prepare("UPDATE active_analyses SET expires_at = ? WHERE token = ?")
      .run(now + JOB_DEADLINE_MS, token);
    db()
      .prepare(
        `INSERT INTO analysis_jobs (id,owner_id,repo_id,repo_name,source_sha,note,draft_id,request_key,payload_hash,analysis_token,model,status,created_at,updated_at,deadline)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,'queued',?,?,?)`,
      )
      .run(
        id,
        input.ownerId,
        input.repoId,
        input.repoName,
        input.sourceSha,
        input.note,
        input.draftId,
        input.key,
        hash,
        token,
        input.model,
        now,
        now,
        now + JOB_DEADLINE_MS,
      );
    recordRequest(id, input.ownerId, input.key);
    return jobById(id, input.ownerId)!;
  })();
}
export function jobAuthorized(job: AnalysisJob) {
  return (
    analysisIsActive(job.analysis_token) &&
    (!job.draft_id ||
      draftAnalysisActive(job.draft_id, job.owner_id, job.analysis_token))
  );
}
export function finishJob(
  job: AnalysisJob,
  status: Exclude<
    JobStatus,
    "queued" | "inspecting" | "generating" | "publishing"
  >,
  code: string | null,
  message: string | null,
) {
  return db().transaction(() => {
    const row = jobById(job.id, job.owner_id);
    if (
      !row ||
      row.lease_token !== job.lease_token ||
      !activeJobStatuses.includes(
        row.status as (typeof activeJobStatuses)[number],
      )
    )
      return false;
    db()
      .prepare(
        `UPDATE analysis_jobs SET status=?,error_code=?,error_message=?,updated_at=?,lease_token=NULL,lease_expires_at=NULL,
      checkpoint_json=NULL,response_json=NULL,result_json=NULL WHERE id=?`,
      )
      .run(status, code, message, Date.now(), job.id);
    releaseAnalysis(row.analysis_token);
    if (row.draft_id)
      resetDraftAnalysis(row.draft_id, row.owner_id, row.analysis_token);
    return true;
  })();
}
export function recoverJobs(now = Date.now()) {
  db().transaction(() => {
    const rows = db()
      .prepare(
        "SELECT * FROM analysis_jobs WHERE status IN ('queued','inspecting','generating','publishing')",
      )
      .all() as AnalysisJob[];
    for (const job of rows) {
      if (
        job.provider_started_at !== null &&
        !job.response_json &&
        !job.result_json &&
        (job.deadline <= now ||
          (job.lease_token && job.lease_expires_at! <= now))
      )
        finishJob(
          job,
          "needs_attention",
          "provider_outcome_unknown",
          "The provider request was interrupted before a response was saved. It may have been charged. No automatic retry was made.",
        );
      else if (job.deadline <= now)
        finishJob(
          job,
          "failed",
          "job_expired",
          "This job exceeded its one-day queue lifetime. Start a new attempt when ready.",
        );
      else if (!jobAuthorized(job))
        finishJob(
          job,
          "canceled",
          "canceled",
          "Publication was canceled or draft authorization expired.",
        );
      else if (job.lease_token && job.lease_expires_at! <= now) {
        if (!job.checkpoint_json && job.inspection_attempts >= 3)
          finishJob(
            job,
            "failed",
            "inspection_interrupted",
            "Source inspection was interrupted repeatedly. Start a new attempt after the service is stable.",
          );
        else
          db()
            .prepare(
              "UPDATE analysis_jobs SET status='queued',lease_token=NULL,lease_expires_at=NULL,updated_at=? WHERE id=?",
            )
            .run(now, job.id);
      }
    }
    db()
      .prepare(
        "DELETE FROM analysis_jobs WHERE status IN ('succeeded','failed','canceled','needs_attention') AND updated_at < ?",
      )
      .run(now - 7 * 86_400_000);
    db()
      .prepare(
        "DELETE FROM analysis_job_requests WHERE job_id NOT IN (SELECT id FROM analysis_jobs)",
      )
      .run();
  })();
}
export function claimNextJob(now = Date.now()): AnalysisJob | null {
  return db().transaction(() => {
    recoverJobs(now);
    if (
      db()
        .prepare(
          "SELECT 1 FROM analysis_jobs WHERE lease_token IS NOT NULL AND lease_expires_at > ? AND status IN ('inspecting','generating','publishing')",
        )
        .get(now)
    )
      return null;
    const job = db()
      .prepare(
        "SELECT * FROM analysis_jobs WHERE status='queued' ORDER BY created_at,rowid LIMIT 1",
      )
      .get() as AnalysisJob | undefined;
    if (!job) return null;
    const lease = randomUUID();
    db()
      .prepare(
        "UPDATE analysis_jobs SET status='inspecting',lease_token=?,lease_expires_at=?,updated_at=?,inspection_attempts=inspection_attempts+? WHERE id=? AND status='queued'",
      )
      .run(lease, now + JOB_LEASE_MS, now, job.checkpoint_json ? 0 : 1, job.id);
    return jobById(job.id, job.owner_id);
  })();
}
export function renewJob(job: AnalysisJob, now = Date.now()) {
  const row = jobById(job.id, job.owner_id);
  if (
    !row ||
    row.lease_token !== job.lease_token ||
    !jobAuthorized(row) ||
    row.deadline <= now
  )
    return false;
  return !!db()
    .prepare(
      "UPDATE analysis_jobs SET lease_expires_at=?,updated_at=? WHERE id=? AND lease_token=? AND status IN ('inspecting','generating','publishing')",
    )
    .run(now + JOB_LEASE_MS, now, job.id, job.lease_token).changes;
}
export function saveJobField(
  job: AnalysisJob,
  field: "checkpoint_json" | "response_json" | "result_json",
  value: unknown,
  status: JobStatus,
) {
  const json = JSON.stringify(value);
  if (Buffer.byteLength(json) > 2_000_000)
    throw Error("Job checkpoint exceeds its storage allowance.");
  if (!renewJob(job)) throw Error("Job authorization or lease changed.");
  if (
    !db()
      .prepare(
        `UPDATE analysis_jobs SET ${field}=?,status=?,updated_at=? WHERE id=? AND lease_token=?`,
      )
      .run(json, status, Date.now(), job.id, job.lease_token).changes
  )
    throw Error("Job lease changed.");
}
export function markProviderStarted(job: AnalysisJob, request: unknown) {
  return db().transaction(() => {
    if (!renewJob(job)) return false;
    const hash = createHash("sha256")
      .update(JSON.stringify(request))
      .digest("hex");
    return !!db()
      .prepare(
        "UPDATE analysis_jobs SET provider_started_at=?,request_hash=?,status='generating' WHERE id=? AND lease_token=? AND provider_started_at IS NULL",
      )
      .run(Date.now(), hash, job.id, job.lease_token).changes;
  })();
}
export function publishJob(
  job: AnalysisJob,
  listing: Parameters<typeof finishAnalysis>[1],
) {
  return db().transaction(() => {
    if (!renewJob(job)) return false;
    const published = job.draft_id
      ? publishDraft(job.draft_id, job.analysis_token, listing)
      : finishAnalysis(job.analysis_token, listing);
    if (!published) return false;
    const row = db()
      .prepare("SELECT id FROM listings WHERE github_repo_id=?")
      .get(job.repo_id) as Pick<Listing, "id">;
    db()
      .prepare(
        "UPDATE analysis_jobs SET status='succeeded',listing_id=?,updated_at=?,lease_token=NULL,lease_expires_at=NULL,checkpoint_json=NULL,response_json=NULL,result_json=NULL,error_code=NULL,error_message=NULL WHERE id=?",
      )
      .run(row.id, Date.now(), job.id);
    return true;
  })();
}
export function cancelJob(id: string, ownerId: number) {
  const job = jobById(id, ownerId);
  if (job)
    finishJob(
      job,
      "canceled",
      "canceled",
      "Publication was canceled. A request already sent to the provider cannot be recalled.",
    );
}
