# Repo Salvage

Good code deserves a second life. Authors nominate public projects; developers discover
individual components and get a source-linked brief explaining what to take, observed
dependencies, integration guidance, limitations, and the evidence behind the recommendation.

## Product flow

1. Browse the component catalog without signing in. Search component names, descriptions,
   dependencies and author context; filter by language, license and category; sort and paginate.
2. Open a component brief to inspect primary and supporting source files, dependency notes,
   integration guidance, limitations and related test paths. Source links are pinned to the
   analyzed commit. Download or copy the JSON reuse brief.
3. Authors sign in with GitHub (`read:user`), choose an owned, non-fork public repository with
   a recognized SPDX license, and add optional context. A bounded source sample is analyzed
   through the existing Anthropic provider integration.
4. Authors review individual briefs. Reviews apply only to that source commit and analysis
   timestamp. Re-analysis replaces briefs and clears reviews. Owners can remove stored listings
   even if GitHub inventory fails or the repository becomes private, deleted or transferred.
5. Reports go to `/moderation`, restricted to numeric GitHub IDs in `MODERATOR_GITHUB_IDS`.
   Operators can hide or restore a listing and resolve reports. Hidden reports remain unresolved
   until restoration so the restore control is not lost. Hiding suppresses pages and downloads;
   owner removal deletes the listing and its reports. The unresolved queue is paginated, so
   older reports and restoration controls remain reachable.

## Evidence boundaries

- **Source sampled:** the primary file's content was supplied to the analysis. Supporting and
  test paths must exist in the complete source tree. This does not establish functional correctness,
  a complete dependency graph, passing tests or safe extraction.
- **Owner reviewed:** the author confirmed the brief for this specific analysis. It is not
  independent test evidence. Model output cannot set this status.
- **Example adaptation tested:** the included standalone parser and Python assignment examples have executable
  consumer tests. This status applies only to that adaptation. Catalog components are not certified as
  independently tested.
- `/examples` contains three manually curated demonstrations from this repository at commit
  `cfeeae509e90b15c04ceabd2a3f7b315dd303b43`. They are not owner-submitted listings and do not
  contribute to catalog or adoption counts. The parser adaptation includes its original MIT notice. A separate MCP host pilot
  at `/examples/assignment` demonstrates a reviewed Python consumer from btcpredictor
  with twelve checks and preserved upstream notices; it also stays outside catalog counts.
- License metadata is not a per-file license audit. Check source licenses, notices and dependencies
  before reuse. New listings require a recognized repository license; older unlicensed listings
  retain visible unknown-license context.
- Anonymous reuse counters from v0.1 are preserved for compatibility, rate limited and omitted from
  public product pages. They are self-reports, not verified adoption.

## Local setup

Node.js 22 is used in CI and the container. SQLite requires persistent local storage.
Python 3.9+ runs the standalone assignment-consumer checks; no Python package is needed.

```sh
npm ci
cp .env.example .env.local
```

Set `AUTH_SECRET` (generate with `openssl rand -base64 32`) and `AUTH_URL=http://localhost:3000`.
Public browsing and worked examples do not require provider or GitHub credentials.
For project sharing, configure:

- `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET`: a GitHub OAuth app with callback
  `http://localhost:3000/api/auth/callback/github`. Keep user access token expiry enabled,
  wildcard redirects disabled and device flow disabled. For another local port or host, set
  `AUTH_URL` to that exact origin and register `${AUTH_URL}/api/auth/callback/github`.
  The app requests only `read:user`. GitHub tokens stay in an encrypted, HTTP-only session
  cookie and are read only on the server. Expiring tokens require a new sign-in shortly
  before their eight-hour lifetime ends; automatic refresh is not implemented and refresh
  tokens are not retained. Legacy apps without token expiry are also supported.
- `ANTHROPIC_API_KEY`: the existing Anthropic analysis provider.
- `ANTHROPIC_WORKSPACE_ID`: required for a personal or service-account key that is not
  scoped to one workspace. Use the `wrkspc_` ID from Claude Console > Settings > Workspaces.
- Optional `SUMMARY_MODEL`: defaults to `claude-haiku-5-5`, a low-cost model supporting
  structured JSON output. Confirm model availability and summary quality for your account
  before a live rollout. Set an explicit override to evaluate another compatible model.
- Optional `DATABASE_PATH`: defaults to `data/salvage.db`.
- `DAILY_SUMMARY_LIMIT`: default 10 attempts per user over a rolling 24 hours.
- `GLOBAL_DAILY_SUMMARY_LIMIT`: default 100 attempts for the entire installation over a
  rolling 24 hours. Set either allowance to 0 to stop analysis. Reservations are transactional;
  a failed attempt after reservation consumes quota. These are request allowances, not a
  dollar budget. SDK automatic retries are disabled and analysis requests time out after two
  minutes; automatic model fallback is disabled and provider billing rules still apply.
  A timeout is not proof the provider did no work.
  Server logs record the actual response model, request ID, stop reason and provider-reported
  token usage, including responses whose contents fail verification. They do not record keys,
  owner notes, source content or generated summaries. Token usage is evidence for a cost estimate;
  the provider's billing records remain authoritative.
- Optional `MODERATOR_GITHUB_IDS`: comma-separated numeric GitHub user IDs. Empty means no
  moderator has access. Populate before public operation so reports have an operator.

The authenticated local pilot used Haiku 5.5 for nine real analyses across seven public
repositories, leaving 34 candidate briefs and an estimated provider cost of $0.043581.
Parser and circuit-breaker extractions passed checks in separate Node consumers.
See [the first pilot](docs/PILOT.md) and [expanded matrix](docs/PILOT-MATRIX.md) for
usage, adaptations and evidence limits. The [agent interface](docs/AGENT-INTERFACE.md)
now supports JSON search, pinned-source inspection and a standalone consumer CLI.
Private agent contribution drafts and a local MCP adapter are implemented.
A native Codex CLI pilot completed discovery-to-adaptation, and ten isolated sessions
answered ten frozen catalog questions exactly. See [the host pilot](examples/agent-host-pilot/README.md)
for provenance, account-usage scope and reproducible test configuration.

## For agents and scripts

Open `/agents` for the guide, `/llms.txt` for the machine index and `/openapi.json`
for the OpenAPI 3.1 contract. Public retrieval needs no credentials or paid analysis.
The API returns structured evidence and error states:

```sh
curl 'http://localhost:3000/api/v1/parts?q=circuit%20breaker&language=TypeScript'
# Follow a result's links.inspect for pinned files, hashes and notice paths.
```

Download `/repo-salvage-cli.tgz` from a trusted running instance and install it in
another workspace. The package has no runtime dependencies and is not published to npm.

```sh
npm install ./repo-salvage-cli.tgz --ignore-scripts
npx --no-install repo-salvage search --base http://localhost:3000 --q "circuit breaker"
npx --no-install repo-salvage inspect LISTING_ID PART_ID --base http://localhost:3000
npx --no-install repo-salvage fetch LISTING_ID PART_ID --base http://localhost:3000 --out ./new-part
```

Replace IDs with a search result. Fetch verifies Git blob hashes and writes source,
discovered notices and a provenance manifest into a new directory. It never executes
source, installs its dependencies or overwrites an existing destination. Notice
discovery and dependency guidance are incomplete; inspect them and test adaptations.
Follow the returned pagination URL; 409 means the catalog changed. HTTP 429/503
includes Retry-After. `AGENT_READ_LIMIT` defaults to 30 shared requests per minute;
0 disables agent reads. See [CLI details](packages/cli/README.md) and the
[independent consumer example](examples/agent-consumer/README.md).
See [agent validation](docs/AGENT-VALIDATION.md) for the installed-package test,
source hashes, API checks and remaining boundaries.

```sh
npm run dev
# http://localhost:3000
```

`predev` and `prebuild` package the standalone example as `public/summary-parser.tar.gz` from
an explicit file allowlist. They also package the agent CLI as `public/repo-salvage-cli.tgz`
from five allowlisted files. Generated archives are ignored by Git and retain their licenses.
Project sharing shows an unavailable state if OAuth credentials have not been configured.
If the analysis provider is unconfigured, signed-in owners retain removal controls; analysis
is disabled and rejected before source requests or quota consumption.

Analysis is serialized per repository with a ten-minute expiring reservation. Failed attempts
release the reservation, and owner removal cancels in-flight publication. Requests based on a
listing removed or replaced during the initial GitHub lookup must be refreshed. Re-analysis
cannot resurrect a removed listing or overwrite a newer completed analysis.

## Verification

```sh
npm run format:check
npm run typecheck
npm test
npm audit --audit-level=high
npm run build
npm start
```

The suite covers legacy database migration, ownership and visibility changes, source provenance,
component filtering, model parsing, quota and report controls, server-side cookie handling,
owner-review authorization, moderator authorization, removal during analysis, overlapping
requests, concurrent hiding, bounded source downloads and report queue pagination. An integration flow uses real SQLite
persistence while mocking GitHub, login and the AI provider; it exercises listing, component search,
owner review, brief export, report handling, hiding, restoring and removal. It does not substitute
for a real OAuth callback or a live provider request.

Run the worked example without installing the app:

```sh
cd examples/summary-parser
node --test consumer.test.mjs
```

Or download the archive from a running app, extract it into another directory and run the same
command. Its README documents the original component's input-shape limitation. `/api/health`
checks local database access; it does not verify GitHub OAuth, the AI provider or public traffic.

See [the review and verification record](docs/REVIEW.md) for the hardened cases, evidence
collected and remaining live gates.

## Production preparation

The app emits a Next.js standalone build. The supplied container runs as an unprivileged user.

```sh
docker build -t repo-salvage .
docker volume create repo-salvage-data
docker run --rm -p 3000:3000 --env-file .env.local \
  --mount source=repo-salvage-data,target=/app/data repo-salvage
```

Use the actual HTTPS origin for `AUTH_URL` and register its GitHub callback. Supply secrets at
runtime, keep them out of image build arguments, and mount persistent storage at `/app/data`.
Use a single application instance with SQLite, back up the database with SQLite's backup API,
and retain backups across releases. Multi-instance/serverless deployment needs a different
storage strategy. Database migrations are additive; back up the database before upgrades.

Public source reads never use a user's bearer token. When OAuth app credentials are configured,
public REST reads use the app's public-data authentication, increasing the public API allowance
without gaining a user's private-repository access. Visibility checks are deduplicated only within
one React request; positive results are not cached across requests. Publication explicitly performs
fresh checks before and after analysis. Requests are bounded in concurrency, time out, and respect
GitHub rate-limit backoff. Failures hide unverifiable listings instead of returning stale source data.
Current repository names and URLs come from the verified numeric repository identity, so a rename
cannot make source links point to a different repository that reuses the old slug.

See [GitHub's public OAuth app rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api#primary-rate-limit-for-oauth-apps).

## Current limits

- AI guidance is derived from at most 14 selected code files, four manifests and a README,
  with character bounds; it can miss dependencies or make incorrect recommendations. Raw
  downloads have ten-second timeouts and a streamed 24 KB prefix limit. Each supplied file is
  capped at 6,000 characters within a 70,000-character total. Briefs automatically disclose
  when their primary file was truncated.
- The app does not execute untrusted repository code or automatically certify extraction.
- Live GitHub OAuth and a real analysis request require operator credentials and separate
  end-to-end validation. A green build or database health response does not establish either.
- The catalog verifies the stored inventory through GitHub for accurate public facets. Large
  catalogs will need a measured indexing and verification strategy; this version is intended
  for a small curated launch.
- Reports are limited per listing, which bounds storage but can temporarily prevent another
  visitor from reporting. Anonymous abuse controls are deliberately not represented as identity
  or adoption verification.
- There are no payments, messaging, automatic repository transfers or public launch claims.

Owners can now delegate **private draft preparation** at `/dashboard/agents`.
Issue an expiring credential for selected licensed public repositories and store
it in the agent's secret environment as `REPO_SALVAGE_TOKEN`. The packaged CLI's
`prepare` and `drafts` commands use it to submit pinned-commit context and read
that credential's private proposals. Draft creation makes no paid calls. Owners
review and edit context, then explicitly trigger the existing paid analysis and
publication flow. Credentials cannot publish, mark owner reviews or access
private repositories. Revocation cancels unfinished draft publication.
See [the contribution contract](docs/AGENT-INTERFACE.md#agent-contributions-implemented)
for scopes, retry behavior, limits and cancellation.

The downloadable [MCP adapter](packages/mcp/README.md) lets supporting agent hosts
use native search, inspection and verified source-text tools over local stdio.
`npm ci` installs its workspace dependencies; the application build produces
`public/repo-salvage-mcp.tgz`. Install that archive in a consumer workspace and
configure the host to launch its executable with `--base ORIGIN`. Public tools
are the default. Private draft tools additionally require `--enable-drafts` and
`REPO_SALVAGE_TOKEN` in the host's secret environment. No paid analysis or
publication tool is exposed. The package is not published to npm and no remote
MCP endpoint is hosted.
