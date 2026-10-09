import Link from "next/link";
import { getSession } from "@/auth";
import { jobsForOwner } from "@/lib/analysis-jobs";
export const dynamic = "force-dynamic";
export default async function JobsPage() {
  const session = await getSession();
  if (!session)
    return (
      <p>
        <Link href="/dashboard">Sign in to view your analysis jobs.</Link>
      </p>
    );
  const jobs = jobsForOwner(session.ghId);
  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">Your analysis jobs</span>
        <h1>Return to the work in progress.</h1>
        <p className="lede">
          Jobs continue on the server after you leave. Open a job for current
          progress or to cancel publication.
        </p>
      </div>
      {!jobs.length && (
        <p className="notice">
          No analysis jobs yet. Choose a public project in your workbench.
        </p>
      )}
      {jobs.map((job) => (
        <div className="dashboard-panel" key={job.id}>
          <h2>
            <Link href={`/dashboard/jobs/${job.id}`}>{job.repo_name}</Link>
          </h2>
          <p>
            {job.status.replaceAll("_", " ")} · requested{" "}
            {new Date(job.created_at).toISOString()}
          </p>
          {job.error_message && <p className="notice">{job.error_message}</p>}
        </div>
      ))}
      <p className="small muted">
        The latest 50 jobs are shown. Finished job details are retained for
        seven days; published analyses remain in listing history.
      </p>
      <Link className="text-link" href="/dashboard">
        Return to your workbench
      </Link>
    </>
  );
}
