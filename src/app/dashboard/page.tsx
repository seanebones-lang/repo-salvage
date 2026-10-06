import { redirect } from "next/navigation";
import { getSession } from "@/auth";
import { listPublicRepos } from "@/lib/github";
import { listingsByOwner } from "@/lib/db";
import RepoRow from "./repo-row";

export const dynamic = "force-dynamic";
const YEAR = 365 * 24 * 3600 * 1000;

export default async function Dashboard() {
  const session = await getSession();
  if (!session) redirect("/");
  let repos;
  try {
    repos = await listPublicRepos(session.accessToken);
  } catch {
    return <p className="err">Couldn't load your repos from GitHub. Sign out and back in, then try again.</p>;
  }
  const listed = new Map(listingsByOwner(session.ghId).map((l) => [l.github_repo_id, l]));
  const now = Date.now();
  const rows = repos
    .map((r) => ({ r, stale: now - Date.parse(r.pushed_at) > YEAR }))
    .sort((a, b) => Number(b.stale) - Number(a.stale) || Date.parse(a.r.pushed_at) - Date.parse(b.r.pushed_at));
  return (
    <>
      <h1>Your public repos</h1>
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
