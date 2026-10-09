import { randomUUID } from "node:crypto";
import Link from "next/link";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "Agent workbench" };
import { redirect } from "next/navigation";
import { getSession } from "@/auth";
import { listPublicRepos } from "@/lib/github";
import {
  credentialsForOwner,
  draftsForOwner,
  activeCredential,
} from "@/lib/contributions";
import { revoke, dismiss } from "./actions";
import CredentialForm from "./credential-form";
import DraftForm from "./draft-form";
export const dynamic = "force-dynamic";
export default async function AgentWorkbench() {
  const session = await getSession();
  if (!session) redirect("/dashboard");
  let repos: { id: number; full_name: string }[] = [];
  let loadError = false;
  try {
    repos = (await listPublicRepos(session.accessToken)).filter(
      (r) =>
        r.owner.id === session.ghId &&
        !r.private &&
        r.license?.spdx_id &&
        r.license.spdx_id !== "NOASSERTION",
    );
  } catch {
    loadError = true;
  }
  const credentials = credentialsForOwner(session.ghId);
  const drafts = draftsForOwner(session.ghId);
  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">Your agent workbench</span>
        <h1>Let your agent prepare. You decide what goes public.</h1>
        <p className="lede">
          Give an agent access to propose reuse context for selected
          repositories. Drafts stay private until you review them and choose to
          analyze and publish.
        </p>
        <Link className="text-link" href="/dashboard">
          Back to your projects
        </Link>
      </div>
      <section className="dashboard-section">
        <h2>Draft inbox</h2>
        <p className="small muted">
          Up to 50 drafts, unfinished proposals first. Agent context is
          untrusted input. Review it before analysis: the context and bounded
          public source evidence will be sent to the configured AI provider, and
          successful analysis publishes the resulting briefs. Existing paid
          analysis limits apply.
        </p>
        {!drafts.length && (
          <p className="notice">
            No agent drafts yet. Create a credential below, then use the CLI
            prepare command.
          </p>
        )}
        {drafts.map((draft) => (
          <div className="dashboard-panel" key={draft.id}>
            <h3>{draft.full_name}</h3>
            <p className="small muted">
              {draft.status} · proposed{" "}
              {new Date(draft.created_at).toISOString()} · commit{" "}
              <code style={{ overflowWrap: "anywhere" }}>
                {draft.source_sha}
              </code>
            </p>
            {draft.status === "pending" &&
            activeCredential(draft.credential_id) ? (
              <DraftForm
                draft={draft}
                analysisEnabled={
                  !!process.env.ANTHROPIC_API_KEY &&
                  process.env.ANALYSIS_WORKER_ENABLED === "1"
                }
                requestKey={randomUUID()}
              />
            ) : (
              <p>{draft.note}</p>
            )}
            {draft.status === "published" && draft.listing_id && (
              <Link className="text-link" href={`/listing/${draft.listing_id}`}>
                View the published briefs
              </Link>
            )}
            {["pending", "analyzing"].includes(draft.status) && (
              <form action={dismiss}>
                <input type="hidden" name="id" value={draft.id} />
                <button className="button button-secondary button-small">
                  Dismiss draft
                  {draft.status === "analyzing"
                    ? " and cancel publication"
                    : ""}
                </button>
              </form>
            )}
            {draft.status === "pending" &&
              !activeCredential(draft.credential_id) && (
                <p className="notice">
                  The credential expired or was revoked. This draft cannot be
                  analyzed.
                </p>
              )}
          </div>
        ))}
      </section>
      <section className="dashboard-section">
        <h2>Scoped credentials</h2>
        <p className="small muted">
          Only draft creation and reading are allowed. Credentials cannot
          publish, mark owner reviews, access private repositories or call paid
          analysis. Revoking one cancels its pending drafts and publication of
          any in-progress draft analysis. Up to 10 active credentials; up to 50
          shown, active credentials first.
        </p>
        {credentials.map((item) => (
          <div className="dashboard-panel" key={item.id}>
            <strong>{item.name}</strong>
            <p className="small muted">
              Repository IDs: {item.repo_ids.join(", ")} · expires{" "}
              {new Date(item.expires_at).toISOString()} ·{" "}
              {item.revoked_at
                ? "revoked"
                : item.expires_at <= Date.now()
                  ? "expired"
                  : "active"}
            </p>
            {!item.revoked_at && (
              <form action={revoke}>
                <input type="hidden" name="id" value={item.id} />
                <button className="button button-secondary button-small">
                  Revoke credential
                </button>
              </form>
            )}
          </div>
        ))}
      </section>
      <section className="dashboard-section">
        <h2>Create a draft credential</h2>
        {loadError && (
          <p className="err">
            GitHub inventory is unavailable. Existing credentials can still be
            revoked and drafts dismissed.
          </p>
        )}
        <div className="dashboard-panel">
          <CredentialForm repos={repos} />
        </div>
      </section>
    </>
  );
}
