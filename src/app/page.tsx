import Link from "next/link";
import { facets, searchListings } from "@/lib/db";

export const dynamic = "force-dynamic";

type SP = Promise<{ q?: string; language?: string; license?: string }>;

export default async function Home({ searchParams }: { searchParams: SP }) {
  const { q, language, license } = await searchParams;
  const listings = searchListings({ q, language, license });
  const f = facets();
  return (
    <>
      <h1>Find parts worth salvaging</h1>
      <p className="muted">Abandoned public repos, flagged by their owners, with the reusable pieces pulled out.</p>
      <form className="filters" method="get">
        <input name="q" placeholder="Search: auth, parser, rate limit…" defaultValue={q} />
        <select name="language" defaultValue={language ?? ""}>
          <option value="">Any language</option>
          {f.languages.map((l) => <option key={l}>{l}</option>)}
        </select>
        <select name="license" defaultValue={license ?? ""}>
          <option value="">Any license</option>
          {f.licenses.map((l) => <option key={l}>{l}</option>)}
        </select>
        <button>Search</button>
      </form>
      {listings.length === 0 && <p className="muted">No listings yet.</p>}
      {listings.map((l) => (
        <div className="card" key={l.id}>
          <h3><Link href={`/listing/${l.id}`}>{l.full_name}</Link></h3>
          <div className="muted">{l.summary.overview}</div>
          <div className="chips">
            {l.language && <span className="chip">{l.language}</span>}
            <span className="chip">{l.license ?? "No license"}</span>
            <span className="chip">★ {l.stars}</span>
            <span className="chip">{l.summary.reusable_pieces.length} parts</span>
            {l.last_human_commit && <span className="chip">last commit {l.last_human_commit.slice(0, 10)}</span>}
          </div>
          {l.owner_note && <div>“{l.owner_note}”</div>}
        </div>
      ))}
    </>
  );
}
