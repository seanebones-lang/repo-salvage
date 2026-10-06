import { redirect } from "next/navigation";
import { getSession } from "@/auth";
import { listPublicRepos } from "@/lib/github";
import { listingsByOwner } from "@/lib/db";
import { unlist } from "./actions";
import type { GhRepo } from "@/lib/github";
import RepoRow from "./repo-row";

export const dynamic = "force-dynamic";
const YEAR = 365 * 24 * 3600 * 1000;

export default async function Dashboard() {
  const session = await getSession();
  if (!session) redirect("/");
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
    .sort((a, b) => Number(b.stale) - Number(a.stale) || Date.parse(a.r.pushed_at) - Date.parse(b.r.pushed_at));
  return (
    <>
      <h1>My listings</h1>
      <p className="muted">Stored listings remain removable if a repository becomes private, is deleted, or changes owner. Public pages hide listings when current visibility or ownership cannot be verified.</p>
      {ownedListings.length === 0 && <p className="muted">You have no stored listings.</p>}
      {ownedListings.map((l) => <div className="card" key={l.id}>
        <strong>{l.full_name}</strong>
        <form action={unlist}><input type="hidden" name="id" value={l.id} /><button className="ghost">Remove listing</button></form>
      </div>)}
      <h2>Your public repos</h2>
      {loadError && <p className="err">Couldn't load your repos from GitHub. Your stored listings can still be removed above. Sign out and back in, then try again.</p>}
      <p className="muted">
        Inactive repos come first. Only repos you mark are stored; each gets one AI summary generated from a sample of its public files.
      </p>
      {rows.map(({ r, stale }) => (
        <RepoRow key={r.id} repoId={r.id} name={r.full_name} pushedAt={r.pushed_at} stale={stale}
          listingId={listed.get(r.id)?.id ?? null} note={listed.get(r.id)?.owner_note ?? null} />
      ))}
    </>
  );
}
