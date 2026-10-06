import { notFound } from "next/navigation";
import { getListing } from "@/lib/db";
import UsedButton from "./used-button";

export const dynamic = "force-dynamic";

export default async function ListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const l = getListing(Number(id));
  if (!l) notFound();
  const blobBase = `${l.url}/blob/HEAD/`;
  return (
    <>
      <h1>{l.full_name}</h1>
      <p>{l.summary.overview}</p>
      <div className="chips">
        {l.summary.languages.map((x) => <span className="chip" key={x}>{x}</span>)}
        {l.summary.frameworks.map((x) => <span className="chip" key={x}>{x}</span>)}
      </div>
      {l.owner_note && <div className="card"><strong>Owner note:</strong> {l.owner_note}</div>}
      <h2>Reusable pieces</h2>
      <ul className="pieces">
        {l.summary.reusable_pieces.map((p) => (
          <li key={p.path + p.name}>
            <strong>{p.name}</strong> — {p.description}{" "}
            <a href={blobBase + p.path.split("/").map(encodeURIComponent).join("/")} target="_blank" rel="noreferrer"><code>{p.path}</code></a>
          </li>
        ))}
      </ul>
      <h2>Details</h2>
      <p className="muted">
        License: {l.license ?? "none declared (check before reusing)"} · ★ {l.stars} · forks {l.forks} · last human commit{" "}
        {l.last_human_commit?.slice(0, 10) ?? "unknown"}
      </p>
      <p className="muted">AI-generated from a sample of the repo. Verify before relying on it.</p>
      <div className="row">
        <a href={l.url} target="_blank" rel="noreferrer"><button>Open on GitHub</button></a>
        <UsedButton id={l.id} initial={l.used_count} />
      </div>
    </>
  );
}
