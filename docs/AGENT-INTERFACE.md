# Agent discovery and reuse interface

Status: discovery, retrieval and private contribution drafts implemented. `/agents` is the browser
entry point, `/llms.txt` links the machine-facing resources and `/openapi.json`
defines the versioned API. The MCP adapter remains planned.
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

## Agent contributions (implemented)

Owners issue draft-only credentials at `/dashboard/agents`. Each credential has
1–20 numeric repository IDs, a name, a 1–168-hour lifetime (default 1 hour), and
256 random bits. Only a SHA-256 hash is stored. The plaintext is returned once
in the authenticated issuer action and must be copied into the agent's secret
environment as `REPO_SALVAGE_TOKEN`. No browser cookies or GitHub OAuth bearer
are shared with the agent. Credentials do not grant private GitHub access,
publication, owner-review changes or paid model calls. Up to 10 active credentials
are permitted per owner, with 20 credential creations per fixed 24-hour window. Issuer GitHub verification is capped at 10 requests per owner per fixed minute before upstream calls.

`POST /api/v1/drafts` requires that credential, an Idempotency-Key of 8–80 safe
characters and JSON `{repo_id, source_sha, note}` (2048-byte body maximum). The
note must contain 1–280 characters of context. The server verifies numeric public
ownership, non-fork status, recognized license and a Git tree at the supplied
40-character commit SHA. It rechecks public ownership and credential validity
after the asynchronous lookup. Agents cannot submit summaries, review status,
arbitrary paths, commands or certification claims. Draft creation performs no
paid analysis and does not change the public catalog.

`GET /api/v1/drafts` returns up to 50 drafts created by this credential, unfinished
first. Both operations share 30 requests per owner per fixed minute. New drafts
are capped at 50 per owner per fixed 24-hour window and 50 unfinished proposals.
Identical canonical proposals and keys return the existing draft, including its
current terminal outcome, without a second upstream lookup or paid call. Reusing
a key for changed context or source returns 409. Canonical context is trimmed;
keys are unique per credential. Inactive credentials cannot replay requests.
Private responses are no-store; no credential or analysis reservation appears
in the response. No automatic retry is implemented.

The owner reviews and may edit context in the private inbox. The owner action
rechecks GitHub ownership and license, requires the default branch to match the
proposed commit **before** reserving a paid analysis, then uses the existing
sampling, provider, per-owner/global quota and publication reservation path.
Approval replaces an existing analysis and clears its owner reviews. Owner
review remains a separate action; approving a draft does not assert tested code.
Successful publication atomically records the listing and terminal draft outcome.
Reapproving a published draft is rejected before spending. Provider failure leaves
a pending draft for deliberate retry; a failed reserved attempt still consumes
its existing analysis allowance. A crashed reservation is recovered after expiry
when the inbox is read, and its late worker cannot publish.

Revocation cancels pending drafts and publication of active draft analyses.
Credential expiry also blocks publication; dismissing a draft cancels its active
reservation. Removing an existing listing cancels its unfinished drafts. Already
incurred provider charges cannot be reversed. Hidden listings cannot be refreshed
through draft approval. A moved default branch requires a new proposal. Previously
published listings remain removable through ordinary owner controls; revoking a
credential does not remove them. Old/expired history is retained; the inbox shows
up to 50 entries with unfinished drafts and active credentials first.

Automatic agent publication and uploaded consumer-test certification are future
features. Read-only MCP tools will receive no implicit write authority. Never run
uploaded commands on the catalog server or list unrelated repositories merely
because an agent can discover them.

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
