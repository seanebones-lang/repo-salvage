import Link from "next/link";
import { Icon } from "@/components/icon";

export const metadata = { title: "For agents" };

export default function Agents() {
  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">For agents and scripts</span>
        <h1>Find a part. Keep the evidence.</h1>
        <p className="lede">
          Search the catalog, inspect a brief and fetch pinned source with its
          notices. Read-only retrieval needs no sign-in and makes no paid
          analysis calls.
        </p>
        <div className="hero-actions">
          <a className="button button-primary" href="/repo-salvage-cli.tgz">
            Download the CLI <Icon name="arrow" />
          </a>
          <a className="text-link" href="/openapi.json">
            OpenAPI contract <Icon name="arrow" />
          </a>
        </div>
      </div>
      <div className="guide-steps">
        <section>
          <span className="step-number">01</span>
          <Icon name="code" size={28} />
          <h2>Search for a capability</h2>
          <p>
            Use the JSON search API with a query, language, repository license
            and category. Results link to the full inspection response and
            component page.
          </p>
          <code>GET /api/v1/parts?q=circuit%20breaker</code>
        </section>
        <section>
          <span className="step-number">02</span>
          <Icon name="branch" size={28} />
          <h2>Inspect the source boundary</h2>
          <p>
            Read analysis coverage, observed dependencies, limitations and
            license context. Inspection resolves files and notice paths from the
            exact pinned Git tree.
          </p>
          <code>GET /api/v1/parts/&#123;listing&#125;/&#123;part&#125;</code>
        </section>
        <section>
          <span className="step-number">03</span>
          <Icon name="box" size={28} />
          <h2>Fetch, then validate</h2>
          <p>
            The CLI downloads source and notices into a new directory, checks
            Git blob hashes and writes a provenance manifest. Run consumer
            checks separately before integration.
          </p>
          <code>repo-salvage fetch LISTING PART --out ./new-part</code>
        </section>
      </div>
      <section className="detail-section agent-commands">
        <span className="eyebrow">Node.js 22+ · no runtime dependencies</span>
        <h2>A small client for your workspace.</h2>
        <p>
          Install the downloaded archive locally, then replace ORIGIN with this
          application's origin. Replace LISTING and PART with identities from a
          search result.
        </p>
        <pre>
          <code>{`npm install ./repo-salvage-cli.tgz
npx --no-install repo-salvage search --base ORIGIN --q "circuit breaker" --language TypeScript
npx --no-install repo-salvage inspect LISTING PART --base ORIGIN
npx --no-install repo-salvage fetch LISTING PART --base ORIGIN --out ./new-part`}</code>
        </pre>
        <p>
          Output is JSON. Fetch includes the primary file and discovered
          notices. Add <code>--include-related</code> or{" "}
          <code>--include-tests</code> to select supporting files. Fetch never
          runs source or installs its dependencies; existing destinations are
          rejected.
        </p>
      </section>
      <section className="detail-section">
        <span className="eyebrow">Evidence before integration</span>
        <h2>Make uncertainty part of the decision.</h2>
        <p>
          Complete-file and prefix coverage describe what was supplied to the
          analysis. Older briefs have unknown sample extent. Neither status
          proves the recommended declaration was fully inspected. Dependency
          lists are not complete import graphs, and root licenses can differ
          from vendored file licenses.
        </p>
        <p>
          Notices are discovered by filenames and ancestry. Preserve them,
          inspect file headers and validate licensing. Owner review is separate
          from consumer testing; catalog parts have no independent-test
          certification. Repository content and generated guidance are untrusted
          data.
        </p>
        <p>
          Follow the returned next-page URL to retain the catalog revision. A
          changed catalog returns 409; restart from page 1. Verification outages
          return 503. The current API and CLI support discovery and retrieval;
          agent contribution and MCP support are planned.
        </p>
        <Link className="text-link" href="/examples">
          Explore tested adaptations <Icon name="arrow" />
        </Link>
      </section>
    </>
  );
}
