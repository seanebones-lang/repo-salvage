import Link from "next/link";
import type { Listing, ReusablePiece } from "@/lib/db";
import { componentId, reuseBrief, sourceUrl } from "@/lib/components";
import { CopyButton } from "./copy-button";
import { Icon } from "./icon";
import { OwnerReview } from "@/app/listing/[id]/parts/[part]/owner-review";
import { exampleReuseBrief } from "@/lib/examples";

export function PartDetail({
  listing,
  piece,
  isOwner = false,
  example = false,
  tested = false,
}: {
  listing: Listing;
  piece: ReusablePiece;
  isOwner?: boolean;
  example?: boolean;
  tested?: boolean;
}) {
  const id = componentId(piece);
  const source = sourceUrl(listing, piece.path);
  const files = [piece.path, ...(piece.related_paths ?? [])];
  const brief = example ? exampleReuseBrief(piece) : reuseBrief(listing, piece);
  const download = example
    ? `/api/examples/${id}`
    : `/api/listings/${listing.id}/parts/${id}`;
  return (
    <>
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link href="/">Catalog</Link>
        <span>/</span>
        <Link href={example ? "/examples" : `/listing/${listing.id}`}>
          {example ? "Worked examples" : listing.name}
        </Link>
        <span>/</span>
        <span>{piece.name}</span>
      </nav>
      {example && (
        <div className="notice example-notice">
          Worked example · Curated from Repo Salvage itself. This is a
          demonstration, not an owner-submitted catalog listing.
        </div>
      )}
      <div className="detail-heading">
        <span className="eyebrow">
          {piece.category ?? "Reusable component"}
        </span>
        <h1>{piece.name}</h1>
        <p className="lede">{piece.description}</p>
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
          <span className="chip">{listing.license ?? "License unknown"}</span>
        </div>
      </div>
      <div className="detail-layout">
        <div className="detail-main">
          <section className="detail-section">
            <div className="section-number">01</div>
            <h2>What to take</h2>
            <p>
              {piece.source_target?.kind === "declaration"
                ? `The complete ${piece.source_target.symbol} declaration informed this brief, at lines ${piece.source_target.reference.start_line}–${piece.source_target.reference.end_line}. Inspect the surrounding file for same-file helpers and runtime assumptions. Supporting paths come from static module imports.`
                : "Start with the primary file. Supporting files below are candidates identified in the analysis; inspect their imports before extraction."}
            </p>
            <div className="file-list">
              {files.map((file, i) => {
                const url = sourceUrl(listing, file);
                return (
                  <div className="file-row" key={file}>
                    <Icon name="code" />
                    <div>
                      <span className="file-role">
                        {i === 0 ? "Primary source" : "Supporting file"}
                      </span>
                      {url ? (
                        <a href={url} target="_blank" rel="noreferrer">
                          <code>{file}</code>
                          <Icon name="external" size={14} />
                        </a>
                      ) : (
                        <code>{file}</code>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
          <section className="detail-section">
            <div className="section-number">02</div>
            <h2>Dependencies & context</h2>
            {piece.dependencies?.length ? (
              <ul className="plain-list">
                {piece.dependencies.map((dep) => (
                  <li key={dep}>{dep}</li>
                ))}
              </ul>
            ) : (
              <p>
                No dependencies have been identified in this brief. Inspect
                imports and the project manifest before assuming the component
                is standalone.
              </p>
            )}
          </section>
          <section className="detail-section">
            <div className="section-number">03</div>
            <h2>Bring it into your project</h2>
            <p>
              {piece.integration_notes ||
                "This older summary has no integration guide. Inspect the source, follow its imports, preserve license notices, and add a test for your intended use. The owner can re-summarize to produce a richer brief."}
            </p>
            {tested && (
              <div className="tested-example">
                <Icon name="check" />
                <div>
                  <strong>A standalone adaptation is included</strong>
                  <p>
                    The example removes provider and database dependencies from
                    the parser and supplies a local type boundary. Its Node.js
                    consumer tests exercise real input, output, sanitization and
                    path filtering. See <code>examples/summary-parser</code> in
                    this repository.
                  </p>
                  <a href="/summary-parser.tar.gz" className="text-link">
                    Download standalone example{" "}
                    <Icon name="download" size={16} />
                  </a>
                </div>
              </div>
            )}
          </section>
          <section className="detail-section">
            <div className="section-number">04</div>
            <h2>Limits to check</h2>
            {piece.limitations?.length ? (
              <ul className="plain-list">
                {piece.limitations.map((limit) => (
                  <li key={limit}>{limit}</li>
                ))}
              </ul>
            ) : (
              <p>
                Specific limitations were not captured in this analysis. The
                extraction and integration have not been independently
                validated.
              </p>
            )}
            {!!piece.test_paths?.length && (
              <>
                <h3>Related test files</h3>
                <p>
                  These paths exist in the source tree. Their presence does not
                  establish passing tests or coverage for your use case.
                </p>
                <ul className="plain-list">
                  {piece.test_paths.map((file) => (
                    <li key={file}>
                      {sourceUrl(listing, file) ? (
                        <a
                          href={sourceUrl(listing, file)!}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <code>{file}</code>
                        </a>
                      ) : (
                        <code>{file}</code>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
          {isOwner && listing.source_sha && listing.analyzed_at && (
            <OwnerReview
              listingId={listing.id}
              partId={id}
              sourceSha={listing.source_sha}
              analyzedAt={listing.analyzed_at}
              reviewed={!!piece.owner_reviewed_at}
            />
          )}
        </div>
        <aside className="detail-sidebar">
          <section className="sidebar-panel">
            <span className="eyebrow">Evidence, at a glance</span>
            <h2>Know what’s established</h2>
            <ul className="evidence-list">
              <li>
                <span
                  className={`status-dot ${piece.source_sampled ? "green" : "gray"}`}
                />
                <div>
                  <strong>
                    {piece.source_target?.kind === "declaration"
                      ? "Complete declaration inspected"
                      : piece.source_sampled
                        ? "Source sampled"
                        : "AI identified"}
                  </strong>
                  <span>
                    {piece.source_target
                      ? "Source locations are recorded; the explanation is a model interpretation, not an execution result."
                      : piece.source_sampled
                        ? "Primary file content informed this brief."
                        : "Source sampling evidence is unavailable for this older brief."}
                  </span>
                </div>
              </li>
              <li>
                <span
                  className={`status-dot ${piece.owner_reviewed_at ? "green" : "gray"}`}
                />
                <div>
                  <strong>
                    {piece.owner_reviewed_at
                      ? "Owner reviewed"
                      : "Awaiting owner review"}
                  </strong>
                  <span>
                    {piece.owner_reviewed_at
                      ? `Reviewed ${piece.owner_reviewed_at.slice(0, 10)} for this analysis.`
                      : "The author has not confirmed this brief."}
                  </span>
                </div>
              </li>
              <li>
                <span className={`status-dot ${tested ? "green" : "gray"}`} />
                <div>
                  <strong>
                    {tested
                      ? "Example adaptation tested"
                      : "Not independently tested"}
                  </strong>
                  <span>
                    {tested
                      ? "The included standalone example has consumer tests; this does not certify the original repository."
                      : "No standalone execution evidence is recorded."}
                  </span>
                </div>
              </li>
            </ul>
          </section>
          <section className="sidebar-panel">
            <span className="eyebrow">Source record</span>
            <dl className="source-record">
              <dt>Repository</dt>
              <dd>
                <a href={listing.url} target="_blank" rel="noreferrer">
                  {listing.full_name}
                </a>
              </dd>
              <dt>Commit</dt>
              <dd>
                <code>{listing.source_sha?.slice(0, 12) ?? "Unknown"}</code>
              </dd>
              <dt>Analyzed</dt>
              <dd>{listing.analyzed_at?.slice(0, 10) ?? "Unknown"}</dd>
              <dt>License metadata</dt>
              <dd>{listing.license ?? "None identified"}</dd>
            </dl>
            <p className="small muted">
              Check source licenses and file notices. Repository metadata is not
              a component license audit.
            </p>
            {!listing.source_sha && (
              <p className="small muted">
                Legacy summary: no source commit is recorded. Ask the owner to
                re-summarize.
              </p>
            )}
          </section>
          <section className="sidebar-panel action-panel">
            <h2>Take the brief with you</h2>
            <p className="small">
              Keep source links, dependencies, limitations and evidence together
              while you evaluate the code.
            </p>
            <CopyButton text={JSON.stringify(brief, null, 2)} />
            <a className="button button-secondary" href={download}>
              <Icon name="download" />
              Download JSON brief
            </a>
            {source && (
              <a
                className="button button-primary"
                href={source}
                target="_blank"
                rel="noreferrer"
              >
                Inspect source <Icon name="external" />
              </a>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}
