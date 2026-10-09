import Link from "next/link";
import type { ComponentEntry } from "@/lib/components";
import { Icon } from "./icon";

export function PartCard({
  entry,
  example = false,
  tested = false,
}: {
  entry: ComponentEntry;
  example?: boolean;
  tested?: boolean;
}) {
  const { piece, listing, id } = entry;
  const href = example
    ? `/examples/${id}`
    : `/listing/${listing.id}/parts/${id}`;
  return (
    <article className="part-card">
      <div className="part-topline">
        <span className="category-label">{piece.category ?? "Other"}</span>
        <Icon name="code" size={20} />
      </div>
      <h3>
        <Link href={href}>{piece.name}</Link>
      </h3>
      <p className="part-description">{piece.description}</p>
      <div className="part-source">
        <Icon name="branch" size={14} />
        <span>{listing.full_name}</span>
      </div>
      <div className="chips">
        {(listing.summary.languages[0] || listing.language) && (
          <span className="chip">
            {listing.summary.languages[0] ?? listing.language}
          </span>
        )}
        <span className={`chip ${listing.license ? "" : "chip-warning"}`}>
          {listing.license ?? "License unknown"}
        </span>
        {example && <span className="chip">Worked example</span>}
      </div>
      <div className="part-footer">
        <span className={tested ? "evidence evidence-good" : "evidence"}>
          <span className="status-dot" />
          {tested
            ? "Example tested independently"
            : piece.owner_reviewed_at
              ? "Owner reviewed"
              : piece.source_sampled
                ? "Source sampled"
                : "AI identified"}
        </span>
        <Link
          href={href}
          className="text-link"
          aria-label={`Explore ${piece.name}`}
        >
          Explore part <Icon name="arrow" size={16} />
        </Link>
      </div>
    </article>
  );
}
