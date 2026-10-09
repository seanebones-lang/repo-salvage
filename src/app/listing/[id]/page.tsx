import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicListing } from "@/lib/public-listings";
import { componentsOf, sourceUrl } from "@/lib/components";
import { PartCard } from "@/components/part-card";
import { Icon } from "@/components/icon";
import ReportButton from "./report-button";

export const dynamic = "force-dynamic";
export default async function ListingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const listing = await getPublicListing(Number(id));
  if (!listing) notFound();
  return (
    <>
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link href="/">Catalog</Link>
        <span>/</span>
        <span>{listing.full_name}</span>
      </nav>
      <div className="detail-heading repository-heading">
        <div>
          <span className="eyebrow">Author-nominated project</span>
          <h1>{listing.name}</h1>
          <p className="lede">{listing.summary.overview}</p>
          <div className="chips">
            {listing.summary.languages.map((lang) => (
              <span className="chip" key={lang}>
                {lang}
              </span>
            ))}
            {listing.summary.frameworks.map((framework) => (
              <span className="chip" key={framework}>
                {framework}
              </span>
            ))}
            <span className={`chip ${listing.license ? "" : "chip-warning"}`}>
              {listing.license ?? "License unknown"}
            </span>
          </div>
          <p className="repository-meta">
            {listing.full_name} · {listing.summary.reusable_pieces.length}{" "}
            candidate parts · last human commit{" "}
            {listing.last_human_commit?.slice(0, 10) ?? "unknown"}
          </p>
        </div>
        <a
          className="button button-secondary"
          href={listing.url}
          target="_blank"
          rel="noreferrer"
        >
          Repository <Icon name="external" />
        </a>
      </div>
      {listing.owner_note && (
        <aside className="owner-note">
          <strong>From the author</strong>
          <p>{listing.owner_note}</p>
        </aside>
      )}
      <div className="section-heading">
        <div>
          <span className="eyebrow">Start with a smaller piece</span>
          <h2>Parts worth a closer look.</h2>
        </div>
      </div>
      <div className="parts-grid">
        {componentsOf([listing]).map((entry) => (
          <PartCard key={entry.id} entry={entry} />
        ))}
      </div>
      <details className="repository-provenance">
        <summary>Source record & direct file links</summary>
        <p>
          {listing.source_sha
            ? `Analyzed ${listing.analyzed_at ?? "unknown date"} · ${listing.summary_model ?? "unknown model"} · commit ${listing.source_sha}`
            : "Legacy summary: source commit unknown. Owner should re-summarize."}
        </p>
        <ul>
          {listing.summary.reusable_pieces.map((piece) => (
            <li key={piece.path + piece.name}>
              {sourceUrl(listing, piece.path) ? (
                <a
                  href={sourceUrl(listing, piece.path)!}
                  target="_blank"
                  rel="noreferrer"
                >
                  <code>{piece.path}</code>
                </a>
              ) : (
                <code>{piece.path}</code>
              )}
            </li>
          ))}
        </ul>
        <p>
          Model interpretation of inspected source. Inspect source licenses and
          test your adaptation before relying on it.
        </p>
      </details>
      <div className="repository-actions">
        <ReportButton id={listing.id} />
        <Link className="text-link" href="/how-it-works">
          Read the evidence guide <Icon name="arrow" size={15} />
        </Link>
      </div>
    </>
  );
}
