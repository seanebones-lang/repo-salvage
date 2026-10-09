import Link from "next/link";
import { publicCatalog } from "@/lib/public-listings";
import {
  CATEGORIES,
  componentsOf,
  filterComponents,
  type ComponentFilters,
} from "@/lib/components";
import { exampleListing, testedExampleId } from "@/lib/examples";
import { PartCard } from "@/components/part-card";
import { Icon } from "@/components/icon";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 12;
function filterHref(
  filters: ComponentFilters,
  changes: Partial<ComponentFilters>,
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({
    ...filters,
    page: undefined,
    ...changes,
  }))
    if (value) params.set(key, value);
  return `/?${params.toString()}#catalog`;
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<ComponentFilters>;
}) {
  const incoming = await searchParams;
  const filters: ComponentFilters = Object.fromEntries(
    Object.entries(incoming).filter(([, value]) => typeof value === "string"),
  );
  const { listings, hidden } = await publicCatalog();
  const entries = componentsOf(listings);
  const filtered = filterComponents(entries, filters);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const requestedPage = Number(filters.page);
  const page =
    Number.isSafeInteger(requestedPage) && requestedPage > 0
      ? Math.min(requestedPage, pages)
      : 1;
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const languages = [
    ...new Set(
      listings.flatMap((l) => [
        ...l.summary.languages,
        ...(l.language ? [l.language] : []),
      ]),
    ),
  ].sort();
  const licenses = [
    ...new Set(listings.flatMap((l) => (l.license ? [l.license] : []))),
  ].sort();
  const hasFilters = !!(
    filters.q ||
    filters.language ||
    filters.license ||
    filters.category
  );
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">
            <span className="status-dot" />
            Good code deserves a second life
          </span>
          <h1>
            The project stopped.
            <br />
            <span>The useful parts didn’t.</span>
          </h1>
          <p>
            Find reusable code in projects their authors have moved on from. See
            what to take, what it depends on, and what still needs checking.
          </p>
          <div className="hero-actions">
            <a href="#catalog" className="button button-primary">
              Explore the parts <Icon name="arrow" />
            </a>
            <Link href="/examples" className="text-link">
              See a worked example <Icon name="arrow" />
            </Link>
          </div>
          <div className="hero-facts">
            <span>Author nominated</span>
            <span>Source linked</span>
            <span>Evidence labeled</span>
          </div>
        </div>
        <div className="salvage-diagram" aria-hidden="true">
          <div className="diagram-caption">SALVAGE FIELD NOTES / 001</div>
          <div className="diagram-repo">
            <Icon name="branch" size={20} />
            <span>one finished chapter</span>
            <span className="diagram-muted">project/</span>
          </div>
          <div className="diagram-lines">
            <span />
            <span />
            <span />
          </div>
          <div className="diagram-parts">
            <div>
              <Icon name="code" />
              <span>parser</span>
              <span className="diagram-tag">KEEP</span>
            </div>
            <div>
              <Icon name="code" />
              <span>middleware</span>
              <span className="diagram-tag">KEEP</span>
            </div>
            <div className="diagram-unused">
              <Icon name="code" />
              <span>old prototype</span>
              <span className="diagram-muted">LEAVE</span>
            </div>
          </div>
          <div className="diagram-note">
            <span className="status-dot" />A smaller piece. A new purpose.
          </div>
        </div>
      </section>
      <div className="principles-strip">
        <div>
          <span className="step-number">01</span>
          <strong>Find a useful part</strong>
          <span>Search by the problem it solves.</span>
        </div>
        <div>
          <span className="step-number">02</span>
          <strong>Read the reuse brief</strong>
          <span>Inspect dependencies and limits.</span>
        </div>
        <div>
          <span className="step-number">03</span>
          <strong>Make it work for you</strong>
          <span>Adapt, test, keep the attribution.</span>
        </div>
      </div>
      <section id="catalog" className="catalog-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">The parts catalog</span>
            <h2>Find your next building block.</h2>
          </div>
          <span className="catalog-count">
            {entries.length} {entries.length === 1 ? "part" : "parts"} /{" "}
            {listings.length}{" "}
            {listings.length === 1 ? "repository" : "repositories"}
          </span>
        </div>
        <form className="catalog-filters" method="get" action="/#catalog">
          <div className="search-field">
            <Icon name="search" size={20} />
            <label className="sr-only" htmlFor="catalog-search">
              Search components
            </label>
            <input
              id="catalog-search"
              name="q"
              type="search"
              placeholder="What do you need? Try parser, auth, rate limit…"
              defaultValue={filters.q ?? ""}
              maxLength={200}
            />
          </div>
          <div className="filter-controls">
            <label>
              <span>Language</span>
              <select name="language" defaultValue={filters.language ?? ""}>
                <option value="">All languages</option>
                {languages.map((lang) => (
                  <option key={lang}>{lang}</option>
                ))}
              </select>
            </label>
            <label>
              <span>License</span>
              <select name="license" defaultValue={filters.license ?? ""}>
                <option value="">All licenses</option>
                {licenses.map((license) => (
                  <option key={license}>{license}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Sort</span>
              <select name="sort" defaultValue={filters.sort ?? "newest"}>
                <option value="newest">Recently analyzed</option>
                <option value="reviewed">Owner reviewed first</option>
                <option value="name">Name, A–Z</option>
              </select>
            </label>
            {filters.category && (
              <input name="category" type="hidden" value={filters.category} />
            )}
            <button className="button button-primary" type="submit">
              Find parts <Icon name="arrow" size={16} />
            </button>
          </div>
        </form>
        <nav className="category-filters" aria-label="Component categories">
          <Link
            className={
              !filters.category ? "category-filter active" : "category-filter"
            }
            href={filterHref(filters, { category: undefined })}
            aria-current={!filters.category ? "page" : undefined}
          >
            All parts
          </Link>
          {CATEGORIES.filter((category) =>
            entries.some(
              (entry) => (entry.piece.category ?? "Other") === category,
            ),
          ).map((category) => (
            <Link
              key={category}
              className={
                filters.category === category
                  ? "category-filter active"
                  : "category-filter"
              }
              href={filterHref(filters, { category })}
              aria-current={filters.category === category ? "page" : undefined}
            >
              {category}
            </Link>
          ))}
        </nav>
        {hidden > 0 && (
          <p className="notice small">
            Some stored listings could not be confirmed as public and owned by
            their submitter. They are hidden from these results; GitHub may also
            be temporarily unavailable.
          </p>
        )}
        {hasFilters && (
          <div className="results-line">
            <span>
              {filtered.length} matching{" "}
              {filtered.length === 1 ? "part" : "parts"}
              {filters.q && <> for “{filters.q}”</>}
            </span>
            <Link href="/#catalog" className="text-link">
              Clear filters
            </Link>
          </div>
        )}
        {visible.length ? (
          <div className="parts-grid">
            {visible.map((entry) => (
              <PartCard key={`${entry.listing.id}-${entry.id}`} entry={entry} />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-icon">
              <Icon name={hasFilters ? "search" : "box"} size={30} />
            </div>
            <h3>
              {hasFilters
                ? "No parts match those filters yet."
                : "The first useful parts start with you."}
            </h3>
            <p>
              {hasFilters
                ? "Try a broader term or clear a filter. The worked examples below show what a complete reuse brief looks like."
                : "The live catalog is ready for its first contributions. Share a public, licensed project—or explore the worked examples below."}
            </p>
            <Link
              className="button button-secondary"
              href={hasFilters ? "/#catalog" : "/dashboard"}
            >
              {hasFilters ? "Reset the search" : "Share a project"}
              <Icon name="arrow" size={16} />
            </Link>
          </div>
        )}
        {pages > 1 && (
          <nav className="pagination" aria-label="Catalog pages">
            {page > 1 && (
              <Link
                className="button button-secondary"
                href={filterHref(filters, { page: String(page - 1) })}
              >
                Previous
              </Link>
            )}
            <span>
              Page {page} of {pages}
            </span>
            {page < pages && (
              <Link
                className="button button-secondary"
                href={filterHref(filters, { page: String(page + 1) })}
              >
                Next
              </Link>
            )}
          </nav>
        )}
      </section>
      <section className="examples-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Before you dive in</span>
            <h2>See what a salvage operation looks like.</h2>
            <p>
              Curated examples from this project, kept separate from the live
              catalog.
            </p>
          </div>
          <Link href="/examples" className="text-link">
            All examples <Icon name="arrow" size={16} />
          </Link>
        </div>
        <div className="parts-grid">
          {componentsOf([exampleListing]).map((entry) => (
            <PartCard
              key={entry.id}
              entry={entry}
              example
              tested={entry.id === testedExampleId}
            />
          ))}
        </div>
      </section>
      <section className="contribute-banner">
        <div>
          <span className="eyebrow">Nothing good has to go to waste</span>
          <h2>
            You moved on.
            <br />
            Someone else can build from here.
          </h2>
          <p>
            Point developers to the work worth keeping. You choose the
            repository and add the context only its author knows.
          </p>
        </div>
        <Link href="/dashboard" className="button button-primary">
          Share useful parts <Icon name="arrow" />
        </Link>
      </section>
    </>
  );
}
