import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/auth";
import { getListing, analysisHistory, type Summary } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };
export default async function AnalysisHistory({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/api/auth/signin");
  const { id } = await params;
  if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) notFound();
  const listing = getListing(Number(id));
  if (!listing || listing.owner_id !== session.ghId) notFound();
  const snapshots = analysisHistory(listing.id, session.ghId) as {
    revision_id: string;
    source_sha: string | null;
    analyzed_at: string | null;
    summary_model: string | null;
    summary_json: string;
    recorded_at: string;
  }[];
  return (
    <>
      <nav className="breadcrumbs">
        <Link href="/dashboard">Workbench</Link>
        <span>/</span>
        <span>Analysis history</span>
      </nav>
      <div className="page-heading">
        <span className="eyebrow">Private owner record</span>
        <h1>{listing.full_name}</h1>
        <p className="lede">
          Analysis and review snapshots preserve what was recorded at each
          revision. A previous snapshot does not establish that the repository
          is currently public or that a component was tested.
        </p>
      </div>
      {!snapshots.length && (
        <p className="notice">
          No archived snapshots yet. Your current listing will be preserved when
          it is reviewed or analyzed again.
        </p>
      )}
      {snapshots.map((snapshot) => {
        const summary = JSON.parse(snapshot.summary_json) as Summary;
        return (
          <section className="dashboard-panel" key={snapshot.revision_id}>
            <h2>{snapshot.analyzed_at ?? "Legacy analysis"}</h2>
            <p>{summary.overview}</p>
            <p>
              {summary.reusable_pieces.length} candidates ·{" "}
              {
                summary.reusable_pieces.filter((p) => p.owner_reviewed_at)
                  .length
              }{" "}
              owner reviews recorded ·{" "}
              {snapshot.summary_model ?? "Model not recorded"}
            </p>
            <p className="small muted">
              Commit: {snapshot.source_sha ?? "Not recorded"}
              <br />
              Revision: {snapshot.revision_id}
            </p>
            <ul className="plain-list">
              {summary.reusable_pieces.map((piece, i) => (
                <li key={i}>
                  <strong>{piece.name}</strong> · <code>{piece.path}</code> —{" "}
                  {piece.description}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </>
  );
}
