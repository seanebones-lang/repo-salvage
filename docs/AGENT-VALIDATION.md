# Agent retrieval validation

Validated locally on 2026-10-08 (America/Chicago) against a standalone production
build at `http://127.0.0.1:3187`. This is retrieval and script-consumer evidence;
there is no public deployment, npm publication, separate model-agent evaluation
or adoption claim.

## Independent package consumer

The downloadable CLI archive was installed with `npm install --ignore-scripts`
in a fresh temporary workspace outside the application. The installed executable
searched for a TypeScript/MIT circuit breaker, inspected the selected result and
fetched its primary source and notice through the versioned API. It did not import
the source checkout's application helpers.

The result was listing 3, part `01a762bc95837106`, from
`seanebones-lang/Brainstormin-System`, repository ID `1131519045`, at commit
`120f8b40de0446fe98c13c604ec4281d0f83185d`. Downloaded bytes matched the pinned
tree's Git blob hashes and the previous independent consumer's SHA-256 evidence:

| File                        | Bytes | Git blob SHA-1                             | SHA-256                                                            |
| --------------------------- | ----: | ------------------------------------------ | ------------------------------------------------------------------ |
| `src/lib/circuitBreaker.ts` | 5,552 | `ba3a3ac6823b6f61144db4590dd028acd5c63b5f` | `4f23280d8ba2364a8a20d660c517c7c272e24ed894205c3961b8f9995c12fd4a` |
| `LICENSE`                   | 1,071 | `4d77f0792f67b11bee051f0d485af4d7c337caa7` | `ea8f3bf6e196fc163a30dcb580af8cd4b77b9509b6f018cf8c9681ee9b7329c7` |

The archive SHA-256 was
`448071c2f1dde4d4756906d1a9fdc29bc7c2b5c2133c10fc6362b0500a87766a`.
The build packages five allowlisted files; the CLI has no runtime dependencies.
The consumer explicitly installed `typescript@5.9.3` as a compiler, checked the
retained source hash again and transpiled the complete file to an ES module.
No implementation edits or app runtime dependencies were needed.

On Node.js 22.22.3, three consumer checks passed: consecutive failures trip the
circuit and suppress a further call, reset restores execution, and a successful
probe after timeout closes the circuit. The [runnable example](../examples/agent-consumer/README.md)
documents the commands and adaptations. Concurrent half-open behavior, load and
security were not tested. The CLI manifest and catalog retain
`independently_tested: false`; these external checks are a separate record.
No paid analysis request was made for this milestone.

## API and application checks

- All 116 Vitest checks, nine CLI Node checks and three existing parser example
  checks passed. GitHub/authentication/provider boundaries are mocked in offline
  application tests; real SQLite is used for the new API lifecycle tests.
- Tests cover schema-valid responses, malformed/repeated/unknown query values,
  excluded repositories, upstream failures, shared read limits, changing catalog
  revisions, removal/hiding/re-analysis during lookup and owner-review freshness.
  A multi-batch regression ensures a later lookup cannot leave an earlier hidden
  listing in the result. Existing public-page behavior remains covered.
- CLI tests cover a real HTTP JSON server, source-byte integrity, retained notices,
  explicit file selection, existing destination/symlink rejection, path/case
  collisions, streamed and aggregate byte limits, and incomplete-output cleanup.
  Remote error codes/status/retry intervals survive without copying remote prose.
- Formatting, TypeScript checks, dependency audit and a production build passed.
  The audit reported zero vulnerabilities. Ajv is a development-only dependency
  for validating responses against the published OpenAPI schemas.
- The real local API returned all 34 catalog parts over two pages with no duplicates
  or omissions. Both search pages and pinned inspection validated against the
  served OpenAPI contract. Empty enum input returned 400. These two search requests
  took approximately 356 ms and 234 ms in this seven-repository local run; this is
  not a load test or a GitHub allowance benchmark.
- Direct HTTP checks returned 200 for the guide, machine index, schema, CLI archive
  and health. The guide rendered without browser warnings/errors. Checked widths
  of 375, 639 and 1280 pixels had no page-level horizontal overflow; the command
  block uses its own horizontal scroll area. This is not a complete accessibility
  audit. The browser viewport was restored after breakpoint checks.

## Remaining boundaries

Retrieval makes no provider request, but public GitHub verification still consumes
its own allowance. The implementation verifies the visible stored inventory for
each search and checks repository identity plus a pinned tree for inspection.
The shared read limiter bounds traffic; it does not guarantee GitHub quota or
large-catalog performance. Positive visibility is not retained across requests.

Existing pilot listings lack persisted coverage detail and correctly report unknown
sample extent. New analyses record server-observed coverage; no extra paid analysis
was used to backfill old records. Declaration coverage, complete dependency graphs
and component license audits remain unverified. Notice discovery is heuristic.
Agent contribution credentials, draft publication and the MCP adapter remain planned.
Container execution and public deployment gates from [the review record](REVIEW.md)
remain open.

## Private contribution milestone — 2026-10-08

The CLI archive is now `@repo-salvage/cli@0.2.0`; the earlier 0.1.0 archive hash
above describes the prior discovery milestone. This milestone's generated archive
SHA-256 is `017275ac7e258c32eccaf4b9a5b7ee5dfb9b8ec3bc041b8a5f7ae8155cbc0342`.

- Offline: **144 Vitest + 10 CLI Node + 3 parser-consumer Node checks = 157**.
  The 28 added contribution checks use actual SQLite and mocked GitHub/provider
  boundaries. They cover hashed storage, owner-only issuance, issuer limits,
  expiry/revocation, repository scopes, shared request/draft caps, bounded JSON,
  concurrent/idempotent proposals, private reads, ownership/license failures,
  moved commits, single-use approval, owner-edited context, failed/crashed
  reservations, moderation, and late cancellation after revocation, dismissal,
  expiry or unlisting. No new real-provider approval was invoked.
- A fresh workspace installed the generated archive with `--ignore-scripts` and
  used its **installed CLI** against a production standalone server on loopback
  port 3188 with a disposable SQLite database and no AI-provider credential.
  Its credential was a seeded, disposable fixture scoped to public MIT
  Brainstormin-System, repository ID `1131519045`, owner ID `227504642`, commit
  `120f8b40de0446fe98c13c604ec4281d0f83185d`. Real GitHub public ownership,
  license and pinned-tree verification succeeded. Create/read persistence,
  identical replay, changed-key conflict, out-of-scope rejection, revocation,
  and actual response/schema checks all passed. No plaintext credential was
  stored or emitted in errors. Fixture credentials and drafts were removed.
- A second fresh workspace installed the same 0.2.0 archive, repeated public
  search/inspect/fetch against the ordinary local catalog, verified pinned
  source/notices, and passed the three explicit circuit-breaker consumer checks.
  This remains sequential behavior evidence, without load or concurrency claims.
- Production build, typecheck and formatting pass. Production dependency audit
  reports zero vulnerabilities. Browser workbench verification used the existing
  signed-in owner session; eligible GitHub repository choices loaded, the
  credential/inbox controls rendered, and 375/639/1280-pixel layouts had no page
  overflow. No browser error/warning logs were observed. Credential issuance was
  not submitted in the owner's live database; issuer and publication actions
  were exercised with test identities and mocked provider responses.

All new live checks incurred **zero paid model calls**, created no new public
listing, and issued no credential in the owner's live database. These are local
HTTP/CLI and test-provider results, not public deployment, an external model-agent
trial, or certification of downstream adaptations. The MCP adapter and automatic
agent publication remain future work. Raw local proofs are retained under ignored
`artifacts/draft-consumer-proof.json` and `artifacts/agent-consumer-proof.json`.
