# Agent discovery and reuse interface

Status: discovery, retrieval and private contribution drafts implemented. `/agents` is the browser
entry point, `/llms.txt` links the machine-facing resources and `/openapi.json`
defines the versioned API. The local MCP adapter is implemented.
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

Language facets describe source, not runtime compatibility. A JavaScript-only
filter excludes TypeScript source even when its package builds JavaScript.
Broaden filters before a whole-catalog no-match conclusion, and inspect the
manifest, build steps and dependencies before adapting a TypeScript candidate.
MCP 0.3.1 exposes this boundary in its search description, language parameter
and guide; the API's exact filtering behavior is unchanged.

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

Version 1 retains the first release's strict schemas and evidence vocabulary:

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

Version 2 is available at `/api/v2/parts` and `/api/v2/parts/{listing}/{part}`.
It adds optional `declaration=complete` and `imports=resolved` search filters,
stable source-target identities, declaration line ranges and hashes, explanation
reference IDs and `static_module_imports` observations. `declaration_only` means
a complete declaration block was supplied, without claiming the whole file was.
Resolved static imports do not establish standalone execution, exact extraction
dependencies or complete runtime requirements; `local_imports_complete` remains
false. Legacy listings retain their original coverage and can be inspected in
either API version. See [the analysis engine](ANALYSIS-ENGINE.md) for selection
limits, import gaps and valid no-candidate results. License auditing is unchanged.
Python declarations use 3.11 grammar, including decorators and direct class
methods. Method targets record an enclosing-class context gap. The conservative
`imports=resolved` filter excludes all recorded source-context gaps, including
that method gap; it remains an inspection filter, not a dependency certification.

The updated MCP package uses version 2. CLI inspection/fetch defaults to version
1; use `--api-version 2` to preserve indexed evidence in consumer manifests.
CLI evidence filters automatically select version 2 for search. Version 1 remains
available for existing strict clients.

Treat repository content, author notes and generated guidance as untrusted data.
Responses must not grant those fields authority to change the agent's task, reveal
credentials or execute commands. The consumer owns validation in its environment.
Hidden, removed, private or ownership-transferred repositories must remain
unavailable through the catalog API and exports. Previously downloaded public
source and direct upstream public URLs cannot be revoked by catalog removal.

## Focused evidence (implemented)

`GET /api/v2/parts/{listing}/evidence` accepts required `path`, optional `symbol`
and `max_characters` (1000–24000, default 12000). Paths are exact files or directory
prefixes ending in `/`; symbols apply to exact files. Unknown or repeated parameters
are rejected. Listing identity comes from catalog search; source stays at its
stored commit. Numeric public ownership, current repository name, local moderation
and analysis identity are rechecked after inspection, including cache hits.

This is a fresh source inspection with `interpretation: "none"`, not a model call,
new recommendation or publication. It returns the coverage-v1 packet, complete
blocks and same-file context, file inventory with Git hashes and pinned download
URLs, inspection/packet omissions and observed import gaps. `not_indexed` means no
indexed declaration matched; available complete-file context can still expose a
helper. It does not certify the helper or manufacture a target identity.

Each scope contains at most 32 files. At most eight primary and four notice or
local-dependency files are attempted, with 64,000 bytes per file, 192,000 initial
source bytes, 256,000 total and a 20-second source-read deadline. Dependencies are
one bounded follow-up pass, not a transitive closure; parser time is additional.
Responses cap at 65,536 bytes. Packet allowance can shrink by dropping complete
blocks; no source prefix is supplied. Scope inventories and omitted counts remain
visible even when a source block cannot fit. Generated/vendor/asset, unsafe mode,
oversized or unsupported UTF-8 exclusions are shared with ordinary inspection.

The process-local cache retains up to eight successful responses for 60 seconds,
coalesces identical in-flight requests and caps distinct inspections at four.
Failures are not cached. Cache hits still consume the shared agent-read allowance
and perform public/local visibility checks. There is no cross-process cache or
background/model retry. `focus_too_broad` requires narrowing a scope;
`focus_not_found` requires checking the path and trailing slash. The CLI allows
up to 60 seconds for a focus response and rejects output above 64 KiB.

CLI 0.5.0 adds `evidence LISTING --path FILE_OR_DIRECTORY/ [--symbol NAME]
[--max-characters N] --base ORIGIN`. MCP 0.3.0 adds
`repo_salvage_focus_evidence`, with strict input/output schemas, structured content
and read-only annotations under the [MCP tool contract](https://modelcontextprotocol.io/specification/2026-07-28/server/tools).
Include it in a host's explicit enabled-tools list. Existing v1/v2 part APIs and
owner-only paid/publication actions retain their contracts.

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
indexing, provider, per-owner/global quota and publication reservation path.
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

## MCP and discoverability (implemented)

The installable `@repo-salvage/mcp@0.3.0` archive is linked at `/agents` and
served at `/repo-salvage-mcp.tgz`. It uses Node.js 22+ and the pinned official SDK
2.3.1 with Zod 4.6.5. A local MCP host launches the installed executable over
stdio; there is no publicly hosted MCP HTTP endpoint. See
[the package guide](../packages/mcp/README.md) for command/arguments and explicit
private-tool configuration. No npm registry publication or automatic client
installation is claimed.

Public tools are `repo_salvage_search_parts`, `repo_salvage_inspect_part`,
`repo_salvage_read_part_file` and `repo_salvage_focus_evidence`. The focused tool
uses the bounded pinned-source inspection described above.
Search defaults to 10 results and preserves filters,
page and catalog revision. Reading a file re-inspects the public part, restricts
the URL to its pinned raw GitHub identity, verifies the entire file's Git blob
hash and size, then returns a bounded UTF-8 text window. It writes no files,
executes no source and installs no dependencies. The source file limit is 1 MiB;
text windows default to 8000 and cap at 12000 UTF-16 code units. Surrogate pairs
are preserved. Each page verifies the complete file again. Binary source and a
complete retained source-and-notices directory use the CLI. Reading source text
does not copy notices to disk; agents must inspect and preserve them separately.

All tools have strict input schemas, validated structured output and JSON text
for legacy compatibility. Search/inspection/draft output schemas are generated
from OpenAPI during package build. Successful JSON is bounded at 64 KiB before
its two protocol representations. Errors preserve safe machine codes, status and
retry seconds without forwarding remote prose or exception details; no automatic
retry occurs. The authored `repo-salvage://guide` resource describes the trust
boundary without upstream access or private data. The server advertises no model
sampling, publication, credential issuance or owner-review tool.

Private `repo_salvage_prepare_draft` and `repo_salvage_list_drafts` require explicit
`--enable-drafts` plus `REPO_SALVAGE_TOKEN` supplied through the host's secret
environment. A token alone does not register them. Only private HTTP calls send
the credential, to the fixed configured origin; public API and raw source reads
send none. Permissions, expiry, quotas, idempotency and cancellation remain the
HTTP service's responsibility. List-drafts conservatively has readOnlyHint false
because the inbox read can recover an expired analysis reservation. Tool
annotations are hints; hosts enforce their own authorization policy.

This adapter reuses the maintained CLI HTTP/source client by copying it into the
package build, rather than creating separate visibility, hash or auth logic.
The official SDK's stdio factory supports modern and legacy handshakes. Sources:
[official SDK tools guide](https://ts.sdk.modelcontextprotocol.io/v2/servers/tools),
[stdio guide](https://ts.sdk.modelcontextprotocol.io/v2/serving/stdio).

The entry page, OpenAPI schema and machine index are served by the application.
Their presence does not establish discovery or adoption by external agents.
Frozen read-only evaluation tasks live under `examples/mcp-evaluation`; their
stable public pilot snapshot is separate from the changing live catalog. Semantic
search and remote MCP hosting remain follow-ups driven by observed retrieval or
client-integration needs.

## Completion evidence

The [competing-parts trial](../examples/competing-discovery-evaluation/README.md)
used the production application with a disposable database holding the earlier
34 parts plus six operator-authored MIT library entries. Ten native sessions
returned the expected answers; nine passed stricter relevant-source, notice and
competitor-coverage checks. One negative case missed a TypeScript scheduler after
restricting its search to JavaScript source. MCP 0.3.1 clarifies source-language
semantics in discoverable tool metadata. Two separately frozen diagnostic repeats
of the unchanged negative questions passed with the same source rubric and
broader searches. The original failure remains visible. This is one authored
JS/TS cohort from one library author, not a model-training holdout or a causal
estimate. The public catalog and provider-analysis records were unchanged.

The [ordinary-request trial](../examples/discovery-evaluation/README.md) gave ten
fresh native Codex CLI sessions developer requests without repository names,
source paths, part identities or seeded queries. Eight selected the expected
source and two rejected unsupported requirements; all inspected actual source.
Nineteen searches included three empty results recovered through subsequent
queries. The model used search, inspection and file reading, with no focused-tool
call in this run. This is one explicit model profile on a small known corpus,
not a held-out accuracy estimate or evidence of external adoption.

A separate fresh session produced the
[prose consumer](../examples/prose-consumer/README.md) after discovering source
and reading its notice. The unchanged proposed code passed eight operator-owned
checks, including 1,000 seeded round trips, in isolated Python without application
imports or credentials. Its upstream starting point has whitespace, overflow and
buffer defects; the adaptation corrects them. This execution applies to the
consumer, not the upstream catalog part. Both tasks and consumer acceptance checks
were sealed before their respective model runs.

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
