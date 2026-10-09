import { notFound } from "next/navigation";
import { getSession } from "@/auth";
import { isModerator } from "@/lib/moderation";
import { moderationReports } from "@/lib/db";
import { handleReport } from "./actions";

export const dynamic = "force-dynamic";
export default async function ModerationPage() {
  const session = await getSession();
  if (!session || !isModerator(session.ghId)) notFound();
  const reports = moderationReports();
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
    </>
  );
}
