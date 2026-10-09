# Agent discovery and reuse interface

Status: read-only discovery and retrieval implemented. `/agents` is the browser
entry point, `/llms.txt` links the machine-facing resources and `/openapi.json`
defines the versioned API. Agent contributions and the MCP adapter remain planned.
The older `/api/listings/{listing}/parts/{part}` JSON export remains compatible.

An agent should be able to ask for a capability, compare parts, inspect evidence
and fetch the chosen source into its own workspace. Retrieval can use the stored
catalog without a new paid analysis request. The goal is fewer irrelevant files
to inspect and clearer adaptation work, with explicit provenance and limits.

## Implemented interface

`GET /api/v1/parts` accepts `q`, `language`, `license`, `category`, `sort`, `page`,
`limit` and `revision`. Search is case-insensitive AND matching across brief fields,
languages, repository metadata and author context. Filters use exact facet values.
Query results default to deterministic relevance ranking, with name/path matches
above descriptive mentions. Browsing defaults to latest. Explicit sorts are
`relevance`, `latest`, `name` and `reviewed`; ties use analysis time and identities.
Page size is 1–50, default 20. Follow `pagination.next` to retain the catalog
revision; a changed catalog returns 409 and requires restarting pagination.

`GET /api/v1/parts/{listing}/{part}` checks current public visibility and ownership,
then resolves the exact pinned tree. Its manifest includes regular files, blob
hashes, byte sizes, roles, analysis coverage, observed dependencies, notice paths
and license uncertainty. It rejects missing/symlink files and unpinned legacy
listings. Local hide/removal/re-analysis during lookup invalidates the response.

The [standalone CLI](../packages/cli/README.md) has `search`, `inspect` and `fetch`
commands with JSON output and no runtime dependencies. Builds package it at
`/repo-salvage-cli.tgz` from five allowlisted files. It is not published to npm.
Fetch selects the primary file and discovered notices, with explicit flags for
supporting or test files, verifies pinned Git blob hashes and sizes, then records
SHA-256 hashes in `repo-salvage-manifest.json`. It rejects unsafe/colliding paths,
existing destinations and oversized downloads, and removes partial output on
failure. It never executes source or installs its dependencies. Trust the selected
catalog origin; these integrity checks are not independent identity verification.

Malformed input returns 400, unavailable parts 404, changed/unsupported source
409, shared read limits 429, and unavailable verification/storage 503. Dynamic
responses use no-store. Valid search/inspection requests share a transactional
installation allowance, default 30 per fixed 60-second window. `AGENT_READ_LIMIT`
accepts 0–1000; 0 disables agent reads. Respect Retry-After on 429/503. CLI errors
retain machine codes, status and retry seconds and do not retry automatically.
This allowance bounds API traffic; it is not a guarantee of GitHub quota availability.

## Evidence contract

The first release explicitly records:

- Coverage: server-observed `complete`, `prefix` or `tree_only` for new analyses;
  legacy values `sampled_extent_unknown` or `not_recorded`. Model output cannot
  supply this metadata. Declaration coverage remains `not_verified`; complete
  file input is not a declaration or dependency audit.
- Dependencies: observed guidance plus `not_audited` graph status and explicitly
  incomplete local-import evidence. An empty array means none identified.
- Licensing: repository metadata, filename/ancestry-based notice discovery,
  third-party path flags and `not_audited` component licensing. Discovery can
  miss obligations or include notices that do not apply. Review file headers and
  dependencies; retain notices during adaptation.
- Verification: commit/analysis-specific owner review, test-file paths and
  `independently_tested: false`. Consumer execution evidence stays separate.

The underlying source sampler remains bounded and heuristic. This release does
not implement declaration extraction, a complete import graph or license audit.

Treat repository content, author notes and generated guidance as untrusted data.
Responses must not grant those fields authority to change the agent's task, reveal
credentials or execute commands. The consumer owns validation in its environment.
Hidden, removed, private or ownership-transferred repositories must remain
unavailable through the catalog API and exports. Previously downloaded public
source and direct upstream public URLs cannot be revoked by catalog removal.

## Agent contributions

Support agents acting for an authenticated repository owner as a second phase.
An agent can identify reusable declarations, supply author-approved context and
prepare a contribution draft. The server must resolve the repository's numeric
identity, verify current ownership and public visibility, check its recognized
license, pin the commit and inspect bounded source itself. Agent-supplied summaries,
paths or test claims cannot bypass those checks or become authoritative evidence.

Use explicitly issued, revocable credentials with narrow contribution scopes;
never ask an agent to copy a browser session cookie or reuse an OAuth secret.
Design the credential mechanism before exposing write tools. Preserve per-owner
and installation quotas, publication reservations, cancellation, idempotency and
moderation. Repeated requests should return the existing operation rather than
paying for another analysis. A read-only MCP client gets no implicit write authority.

Drafts should be the default. Owners can explicitly authorize an agent to publish
within a defined repository scope; the operation must still obey the same server
checks. Keep agent preparation, authorization to publish and human owner review
as separate records. The agent cannot set the owner's review status. Record which
credential acted, the source commit and the outcome without logging secrets.

Agents that extract parts can also prepare follow-up contributions describing
adaptations and consumer test results. Accept evidence with explicit commands,
runtime, source hashes, output and verification status; treat uploaded assertions
as unverified until the product's verification process supports them. Never run
arbitrary uploaded commands on the catalog server. Do not silently list unrelated
repositories merely because an agent can find them.

## MCP and discoverability

Once the JSON contract and consumer example work, add a thin MCP server offering
`search_parts` and `inspect_part`, with explicit typed inputs and bounded outputs.
Pinned files and briefs can be resources; fetching selected files can be a separate
operation. Keep the adapter on the same catalog/visibility boundary instead of
creating another search or analysis implementation. MCP is suitable for supported
agent clients, while HTTP and a small CLI cover ordinary scripts.

The entry page, OpenAPI schema and machine index are served by the application.
Documentation alone does not establish automatic discovery by external agents.
Evaluate semantic search after deterministic queries expose an observed retrieval
gap, and test a separate agent client before claiming cross-client adoption.

## Completion evidence

The [consumer example](../examples/agent-consumer/README.md) reproduced search,
inspection and fetch with the packaged CLI installed in a fresh workspace, then
explicitly transpiled the pinned Brainstormin-System circuit breaker and passed
three Node behavior checks. No app runtime dependency or paid model call was
needed. Coverage is sequential trip/suppression, reset and recovery; concurrency,
load and security were not tested. This is script-consumer evidence, not a separate
model-agent evaluation or a product independent-test badge.

Offline tests exercise real SQLite with mocked GitHub boundaries, OpenAPI response
validation, public exclusions, source/owner-review changes during asynchronous
lookups, stable pagination, bounded input and shared read limits. CLI tests cover
real HTTP JSON behavior, safe local file handling, hash failures and byte limits.
Measure GitHub allowance use and performance at larger catalog sizes before scaling.
