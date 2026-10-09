import Link from "next/link";
import { notFound } from "next/navigation";
import { randomUUID } from "node:crypto";
import { getSession } from "@/auth";
import { jobById, publicJob, activeJobStatuses } from "@/lib/analysis-jobs";
import { cancelAnalysis } from "../../actions";
import JobProgress from "../job-progress";
import RetryForm from "../retry-form";
export const dynamic = "force-dynamic";
export default async function JobPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session)
    return (
      <p>
        <Link href="/dashboard">Sign in to view your analysis jobs.</Link>
      </p>
    );
  const job = jobById((await params).id, session.ghId);
  if (!job) notFound();
  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">Analysis progress</span>
        <h1>{job.repo_name}</h1>
        <p className="lede">
          The selected source commit stays fixed for this job.
        </p>
        <p>
          <code style={{ overflowWrap: "anywhere" }}>{job.source_sha}</code>
        </p>
        <p className="small muted">Requested model: {job.model}</p>
      </div>
      <JobProgress initial={publicJob(job)} />
      {activeJobStatuses.includes(
        job.status as (typeof activeJobStatuses)[number],
      ) && (
        <form action={cancelAnalysis}>
          <input type="hidden" name="jobId" value={job.id} />
          <button className="button button-secondary">
            Cancel publication
          </button>
          <p className="small muted">
            A provider request already sent cannot be recalled.
          </p>
        </form>
      )}
      {["failed", "needs_attention", "canceled"].includes(job.status) && (
        <section className="dashboard-section">
          <h2>Start again when ready</h2>
          <RetryForm
            repoId={job.repo_id}
            draftId={job.draft_id}
            note={job.note}
            requestKey={randomUUID()}
            uncertain={
              job.status === "needs_attention" ||
              (job.status === "canceled" && job.provider_started_at !== null)
            }
          />
        </section>
      )}
      <p>
        <Link className="text-link" href="/dashboard/jobs">
          All your analysis jobs
        </Link>
      </p>
    </>
  );
}
