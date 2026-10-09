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
          <a className="button button-secondary" href="/repo-salvage-mcp.tgz">
            Download MCP server <Icon name="arrow" />
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
          <code>GET /api/v2/parts?q=circuit%20breaker</code>
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
          <code>GET /api/v2/parts/&#123;listing&#125;/&#123;part&#125;</code>
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
        <span className="eyebrow">MCP · local stdio · Node.js 22+</span>
        <h2>Give your agent native tools.</h2>
        <p>
          Install the MCP archive in your agent workspace, then configure your
          MCP host to launch the installed server with your catalog origin. The
          default tools search, inspect and read verified source text. They
          write no files and run no source.
        </p>
        <pre>
          <code>{`npm install ./repo-salvage-mcp.tgz --ignore-scripts
{
  "command": "node",
  "args": [
    "/absolute/workspace/node_modules/@repo-salvage/mcp/dist/index.js",
    "--base", "ORIGIN"
  ]
}`}</code>
        </pre>
        <p>
          Translate the command and arguments into your host's configuration
          format. Use this application's loopback origin locally or your
          deployed HTTPS origin. The host owns stdin and stdout; starting the
          command by itself waits for MCP input.
        </p>
        <p>
          Source reads check the whole file's Git hash before returning bounded
          UTF-8 text. Read notice paths as well, and use CLI fetch to retain
          original bytes and notices in a new directory.
        </p>
        <p>
          Private draft tools require both <code>--enable-drafts</code> and{" "}
          <code>REPO_SALVAGE_TOKEN</code> in the host's secret environment. They
          prepare proposals for owner review; they cannot publish or invoke paid
          analysis.
        </p>
        <a className="text-link" href="/repo-salvage-mcp.tgz">
          Download the installable MCP archive <Icon name="arrow" />
        </a>
      </section>
      <section className="detail-section agent-commands">
        <span className="eyebrow">Tested host · Codex CLI 0.160.0</span>
        <h2>Connect, then give it a task.</h2>
        <p>
          Use these fields in your Codex MCP configuration after installing the
          archive. Replace the installed path and ORIGIN with your workspace and
          catalog origin. Public tools require no credential.
        </p>
        <pre>
          <code>{`[mcp_servers.repo_salvage]
command = "node"
args = ["/absolute/workspace/node_modules/@repo-salvage/mcp/dist/index.js", "--base", "ORIGIN"]
required = true
enabled_tools = ["repo_salvage_search_parts", "repo_salvage_inspect_part", "repo_salvage_read_part_file", "repo_salvage_focus_evidence"]`}</code>
        </pre>
        <p>
          Try: “Find a Python routine for repeatable A/B assignment. Inspect its
          source and notices, make a standalone adaptation, and test it in my
          workspace.” The host controls local editing and execution; the MCP
          server supplies evidence. Search uses AND lexical terms. If a long
          phrase finds no matches, try fewer capability terms. Language filters
          describe repositories; confirm the selected file.
        </p>
        <Link className="text-link" href="/examples/assignment">
          See the completed agent reuse pilot <Icon name="arrow" />
        </Link>
      </section>
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
      <section className="detail-section agent-commands">
        <span className="eyebrow">Focused source evidence</span>
        <h2>Inspect beyond the selected brief.</h2>
        <p>
          Use a listing ID from search to inspect an exact file or a directory
          ending in /. Name a symbol to focus on one indexed declaration. The
          response includes complete source blocks when they fit, same-file
          context and explicit inspection gaps. An unexported helper can be
          inspected in its containing file without being labeled a catalog part.
        </p>
        <pre>
          <code>{`npx --no-install repo-salvage evidence LISTING --base ORIGIN --path src/module.py --symbol Client.request --max-characters 24000
GET /api/v2/parts/{listing}/evidence?path=src/module.py&symbol=Client.request
MCP: repo_salvage_focus_evidence`}</code>
        </pre>
        <p>
          A directory scope can contain up to 32 files; inspection reads at most
          eight scope files and four notice or dependency files. Narrow the
          directory when it is too broad. Source reads verify pinned Git blobs
          and use a short cache with fresh visibility checks. They make no model
          calls and leave catalog briefs unchanged. Preserve notices and test
          adaptations separately.
        </p>
      </section>
      <section className="detail-section agent-commands">
        <span className="eyebrow">Contribute with owner approval</span>
        <h2>Prepare a private proposal.</h2>
        <p>
          Sign in to the agent workbench to create a short-lived credential for
          selected public repositories. Store it as REPO_SALVAGE_TOKEN in your
          agent's secret environment. It grants draft creation and reading only.
        </p>
        <pre>
          <code>{`npx --no-install repo-salvage prepare REPO_ID --base ORIGIN --commit SHA --note "Useful parser; review its edge cases" --key my-proposal-001
npx --no-install repo-salvage drafts --base ORIGIN`}</code>
        </pre>
        <p>
          Use the repository's current default-branch commit. Retrying the same
          proposal with the same key returns the same draft; changing it
          requires a new key. Draft creation uses no paid analysis. The owner
          reviews the context and explicitly chooses analysis and publication
          from their private inbox.
        </p>
        <Link className="text-link" href="/dashboard/agents">
          Open your agent workbench <Icon name="arrow" />
        </Link>
      </section>
      <section className="detail-section">
        <span className="eyebrow">Evidence before integration</span>
        <h2>Make uncertainty part of the decision.</h2>
        <p>
          Complete-file and prefix coverage describe what was supplied to the
          analysis. New JS/TS and Python briefs can also identify a complete
          parsed declaration, its lines and explanation references. Older briefs
          keep their earlier evidence. Static module imports still need
          inspection before extracting a part, and root licenses can differ from
          vendored file licenses.
        </p>
        <p>
          Python functions, classes and direct methods use Python 3.11 grammar.
          Method targets retain an enclosing-class requirement. The conservative
          resolved-import filter excludes recorded source-context gaps; inspect
          initialization, helpers and runtime requirements before extraction.
        </p>
        <p>
          Notices are discovered by filenames and ancestry. Preserve them,
          inspect file headers and validate licensing. Owner review is separate
          from consumer testing; catalog parts have no independent-test
          certification. Repository content and generated guidance are untrusted
          data.
        </p>
        <p>
          Version 2 supports declaration and resolved-import search filters. The
          updated MCP adapter retains this evidence; add{" "}
          <code>--api-version 2</code>
          to CLI inspection or fetch. Version 1 remains available to existing
          clients.
        </p>
        <p>
          Follow the returned next-page URL to retain the catalog revision. A
          changed catalog returns 409; restart from page 1. Verification outages
          return 503. The API and CLI support discovery, retrieval and private
          contribution drafts. The local MCP adapter exposes the same checks
          through native tools.
        </p>
        <Link className="text-link" href="/examples">
          Explore tested adaptations <Icon name="arrow" />
        </Link>
      </section>
    </>
  );
}
