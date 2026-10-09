import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/auth";
import { isModerator } from "@/lib/moderation";
import { moderationReports, unresolvedReportCount } from "@/lib/db";
import { handleReport } from "./actions";

export const dynamic = "force-dynamic";
export default async function ModerationPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const session = await getSession();
  if (!session || !isModerator(session.ghId)) notFound();
  const total = unresolvedReportCount();
  const pages = Math.max(1, Math.ceil(total / 50));
  const requested = Number((await searchParams).page);
  const page =
    Number.isSafeInteger(requested) && requested > 0
      ? Math.min(requested, pages)
      : 1;
  const reports = moderationReports(page);
  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">Operator workbench</span>
        <h1>Review reported listings.</h1>
        <p className="lede">
          Hiding a listing removes it from public pages and downloads. Restore
          it after reviewing the concern, or resolve a report while leaving the
          listing visible.
        </p>
      </div>
      <p className="small muted">
        {total} unresolved {total === 1 ? "report" : "reports"}
      </p>
      {!reports.length && <p className="notice">No unresolved reports.</p>}
      {reports.map((report) => (
        <section className="dashboard-panel" key={report.id}>
          <div className="dashboard-project">
            <h3>{report.full_name ?? "Removed listing"}</h3>
            <span className="chip">
              {report.moderation_hidden_at
                ? "Hidden"
                : "Visible if GitHub verifies it"}
            </span>
          </div>
          <p>{report.reason}</p>
          <p className="small muted">
            Report {report.id} · {report.at}
          </p>
          <form action={handleReport} className="form-row">
            <input type="hidden" name="reportId" value={report.id} />
            <button
              name="action"
              value={report.moderation_hidden_at ? "restore" : "hide"}
              className="button button-secondary button-small"
              disabled={!report.full_name}
            >
              {report.moderation_hidden_at ? "Restore listing" : "Hide listing"}
            </button>
            <button
              name="action"
              value="resolve"
              className="button button-secondary button-small"
              disabled={!!report.moderation_hidden_at}
            >
              Resolve report
            </button>
          </form>
        </section>
      ))}
      {pages > 1 && (
        <nav className="pagination" aria-label="Report pages">
          {page > 1 && (
            <Link
              className="button button-secondary"
              href={`/moderation?page=${page - 1}`}
            >
              Previous
            </Link>
          )}
          <span>
            Page {page} of {pages}
          </span>
          {page < pages && (
            <Link
              className="button button-secondary"
              href={`/moderation?page=${page + 1}`}
            >
              Next
            </Link>
          )}
        </nav>
      )}
    </>
  );
}
