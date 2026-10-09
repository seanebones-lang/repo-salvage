import Link from "next/link";
import { getSession, signIn } from "@/auth";
import { Icon } from "@/components/icon";
import { listPublicRepos } from "@/lib/github";
import { listingsByOwner } from "@/lib/db";
import { unlist } from "./actions";
import type { GhRepo } from "@/lib/github";
import RepoRow from "./repo-row";
import { randomUUID } from "node:crypto";

export const dynamic = "force-dynamic";
const YEAR = 365 * 24 * 3600 * 1000;

export default async function Dashboard() {
  const session = await getSession();
  if (!session)
    return (
      <>
        <div className="page-heading">
          <span className="eyebrow">Share the work worth keeping</span>
          <h1>Your project can have another chapter.</h1>
          <p className="lede">
            Choose a public repository you own, tell us which parts matter, and
            give other developers a useful place to start.
          </p>
        </div>
        <div className="dashboard-panel">
          <h2>Start with your GitHub account</h2>
          <p>
            We request public profile access. Only repositories you explicitly
            choose are listed. A recognized repository license is required, and
            you can remove your listings at any time.
          </p>
          {process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET ? (
            <form
              action={async () => {
                "use server";
                await signIn("github", { redirectTo: "/dashboard" });
              }}
              className="form-row"
            >
              <button className="button button-primary">
                Continue with GitHub <Icon name="arrow" />
              </button>
            </form>
          ) : (
            <p className="notice">
              Project sharing is not configured on this installation yet. You
              can explore the worked examples while it is being set up.
            </p>
          )}
          <Link
            className="text-link"
            href="/examples"
            style={{ marginTop: 20 }}
          >
            See what your parts will look like <Icon name="arrow" />
          </Link>
        </div>
      </>
    );
  const analysisEnabled =
    !!process.env.ANTHROPIC_API_KEY &&
    process.env.ANALYSIS_WORKER_ENABLED === "1";
  const ownedListings = listingsByOwner(session.ghId);
  let repos: GhRepo[] = [];
  let loadError = false;
  try {
    repos = await listPublicRepos(session.accessToken);
  } catch {
    loadError = true;
  }
  const listed = new Map(ownedListings.map((l) => [l.github_repo_id, l]));
  const now = Date.now();
  const rows = repos
    .map((r) => ({ r, stale: now - Date.parse(r.pushed_at) > YEAR }))
    .sort(
      (a, b) =>
        Number(b.stale) - Number(a.stale) ||
        Date.parse(a.r.pushed_at) - Date.parse(b.r.pushed_at),
    );
  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">Your salvage workbench</span>
        <h1>Share what’s worth keeping.</h1>
        <p className="lede">
          Choose a project and add the context only you know. After analysis,
          review each component brief to help other developers evaluate it.
        </p>
      </div>
      <p>
        <Link className="text-link" href="/dashboard/jobs">
          Open analysis jobs
        </Link>
        {" · "}
        <Link className="text-link" href="/dashboard/agents">
          Manage agent credentials and contribution drafts
        </Link>
      </p>
      <section className="dashboard-section">
        <h2>My listings</h2>
        <p className="small muted">
          Stored listings remain removable if a repository becomes private, is
          deleted, or changes owner. Public pages hide listings when current
          visibility or ownership cannot be verified.
        </p>
        {ownedListings.length === 0 && (
          <p className="notice">
            You have no stored listings. Choose a project below to create your
            first reuse briefs.
          </p>
        )}
        {ownedListings.map((l) => (
          <div className="dashboard-panel" key={l.id}>
            <div className="dashboard-project">
              <div>
                <strong>
                  <Link href={`/listing/${l.id}`}>{l.full_name}</Link>
                </strong>
                <p>
                  {l.summary.reusable_pieces.length} parts ·{" "}
                  {
                    l.summary.reusable_pieces.filter((p) => p.owner_reviewed_at)
                      .length
                  }{" "}
                  owner reviewed
                </p>
              </div>
              <div className="form-row">
                <Link className="text-link" href={`/listing/${l.id}`}>
                  Review parts <Icon name="arrow" size={15} />
                </Link>
                <Link className="text-link" href={`/dashboard/history/${l.id}`}>
                  Analysis history
                </Link>
                <form action={unlist}>
                  <input type="hidden" name="id" value={l.id} />
                  <button className="button button-secondary button-small">
                    Remove listing
                  </button>
                </form>
              </div>
            </div>
          </div>
        ))}
      </section>
      <section className="dashboard-section">
        <h2>Your public projects</h2>
        {!analysisEnabled && (
          <p className="notice">
            Analysis is not configured on this installation yet. You can still
            remove your existing listings above.
          </p>
        )}
        {loadError && (
          <p className="err">
            Couldn't load your repos from GitHub. Your stored listings can still
            be removed above. Sign out and back in, then try again.
          </p>
        )}
        <p className="small muted">
          Inactive projects come first, but any licensed project can contribute
          useful parts. Only projects you choose are stored. Each analysis sends
          bounded public source evidence to the configured AI provider.
          Inventory shows up to 500 owned, non-fork public repositories.
        </p>
        {rows.map(({ r, stale }) => (
          <RepoRow
            key={r.id}
            repoId={r.id}
            name={r.full_name}
            pushedAt={r.pushed_at}
            stale={stale}
            listingId={listed.get(r.id)?.id ?? null}
            note={listed.get(r.id)?.owner_note ?? null}
            license={r.license?.spdx_id ?? null}
            analysisEnabled={analysisEnabled}
            requestKey={randomUUID()}
          />
        ))}
        {!loadError && !rows.length && (
          <p className="notice">
            No owned, non-fork public repositories were found. Existing listing
            removal controls remain available above.
          </p>
        )}
      </section>
    </>
  );
}
