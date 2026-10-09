# Agent retrieval validation

Validated locally on 2026-10-08 (America/Chicago) against a standalone production
build at `http://127.0.0.1:3187`. Dated milestones below distinguish script
consumers, a native model-agent trial and a frozen catalog evaluation. There is
no public deployment, npm publication or adoption claim.

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
At the discovery milestone, agent contribution credentials, draft publication and
the MCP adapter remained planned; subsequent milestones are recorded below.
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
trial, or certification of downstream adaptations. At this milestone the MCP adapter and automatic
agent publication remained future work; MCP validation follows below. Raw local proofs are retained under ignored
`artifacts/draft-consumer-proof.json` and `artifacts/agent-consumer-proof.json`.

## MCP milestone — 2026-10-08

The downloadable local stdio adapter is `@repo-salvage/mcp@0.1.0`, Node.js 22+,
with pinned official server SDK 2.3.1 and Zod 4.6.5. Its archive SHA-256 is
`860ee164e2d6aac4d961df97f098b037e71059609639d65be55b9b116bac093e`.
The shared CLI client is now 0.3.0; its archive SHA-256 is
`8d111e3a2c8702baa50f680e257d84fcf58fd8c046e9ce9eca77c3664ee8b91f`.
Previous hashes above remain evidence of their dated milestones.

- **182 offline checks pass:** 144 app, 3 parser consumer, 12 CLI, 13 MCP protocol
  and 10 frozen evaluation evidence replays. Actual stdio processes negotiate both
  modern and legacy protocol with the official client. Checks cover strict inputs,
  structured output schemas, HTTP/rate/revision errors, bounded malformed/oversized
  responses, explicit draft enablement, credential reflection, prevention of credential-bearing
  proposals before HTTP, revocation, verified
  whole-file reads, Unicode paging, hash failures, traversal and clean stdout.
- A fresh independent workspace installed the served MCP archive with
  `--ignore-scripts` and launched its installed executable through the official
  SDK client. Against the ordinary production standalone catalog, it searched and
  inspected Brainstormin-System's circuit breaker, reconstructed **5552 source
  bytes in eight text windows**, verified the Git blob and SHA-256, read its pinned
  LICENSE, and rejected a missing manifest path. Source commit remains
  `120f8b40de0446fe98c13c604ec4281d0f83185d`; source SHA-256 is
  `4f23280d8ba2364a8a20d660c517c7c272e24ed894205c3961b8f9995c12fd4a`.
- The same installed executable exercised both opt-in private tools against a
  second production standalone instance with a disposable SQLite database, no AI
  credential and zero paid quota. Real GitHub public owner/license/tree verification,
  persistence, identical replay, conflict and scope rejection, private list and
  revocation passed. Credentials were hash-only in storage; test rows and the
  disposable database were removed. No credential was issued in the owner's live DB.
- MCP Inspector 2.10.1 passed strict tool discovery with **zero errors and ten
  advisory warnings** about legal JSON Schema nullable type arrays. Its search
  call and static guide-resource read passed. These advisories flag compatibility
  with hosts translating schemas into narrower provider dialects; they are not a
  claim that every third-party host has been tested. Both protocol eras are tested
  with the official SDK. A separate host/model pilot remains an open gate.
- Ten independent, read-only, multi-hop evaluation questions span the seven
  approved repositories. All **31 recorded search/inspection calls** replay through
  the actual MCP server and match recorded evidence. The snapshot revision is
  `984de759101f3a54f44fe135206151eb1c882c0270747f0b98d8f7c1614a6a48`.
  Questions, exact answers and reproducible calls are committed under
  `examples/mcp-evaluation`. This checks evidence replay, not scored model-agent
  accuracy; generated guidance remains untrusted. Replay filtering/order is a
  documented fixture simplification, not production search validation.
- A fresh installation of CLI 0.3.0 repeated search/inspect/fetch and passed the
  three explicit circuit-breaker consumer checks. Production build, typecheck,
  formatting and full dependency audit pass with zero reported vulnerabilities.
  The new guide had no browser warnings/errors or page overflow at widths 375,
  639 and 1280. Normal viewport restored; two additional raw browser recording
  segments and a guide screenshot retained locally.

New verification used **zero paid model calls** and created no public listing or
live-owner credential. Public mode exposes three tools; explicit draft mode adds
only prepare/list. Reading a draft inbox is conservatively marked non-read-only
because the HTTP service can recover expired reservations. No MCP tool publishes,
charges for analysis, issues credentials or executes retrieved source. Successful
JSON output is limited to 64 KiB before its two protocol representations; source
files to 1 MiB, UTF-8 windows to 12000 UTF-16 code units. Each window rechecks the
whole file. Use the CLI for retained original bytes and notices.

This adapter is a downloadable local process, not a public remote MCP deployment
or an npm-registry publication. Public deployment, container validation, larger
catalog/load behavior, actual external model-agent use and automated publication
remain outside these results. Raw live proofs are retained under ignored
`artifacts/mcp-consumer-proof.json`, `artifacts/agent-consumer-proof.json` and
`artifacts/mcp-inspector-*.json`.

## Native Codex host and reviewed consumer — 2026-10-08

The separate host gate above is now exercised for **Codex CLI 0.160.0**. This
milestone downloaded the same MCP 0.1.0 archive into a fresh temporary workspace,
installed it with `--ignore-scripts`, and launched it as a required MCP server in
an ephemeral Codex process. Invocation-only overrides ignored user configuration,
disabled web search and exposed only the three public retrieval tools. Existing
ChatGPT authentication supplied normal Codex account usage. No provider key was
passed; the CLI default model ID was not independently recorded.

The host received a generic Python repeatable A/B assignment task, with no part
identity, source, fixture or expected answer. **Four native MCP calls** searched
for `assignment`, inspected listing 7 / part `87b6a59b3f501640`, and read the entire
pinned source plus MIT notice. It wrote a standard-library consumer and passed
six tests in its own workspace, exiting successfully. Parent verification
reconstructed the returned text, confirmed complete windows and independently
checked the source and preserved notice hashes:

| File                          |  Bytes | Git blob SHA-1                             | SHA-256                                                            |
| ----------------------------- | -----: | ------------------------------------------ | ------------------------------------------------------------------ |
| `btc_predictor/ab_testing.py` | 11,525 | `996620fdb9119b1643e451d1c768e0a3068c7697` | `b34b87a075170c2155f8f03eecfcb559d1c6d070ee458a85369bcddc68eaa32c` |
| `LICENSE`                     |  1,071 | `4d77f0792f67b11bee051f0d485af4d7c337caa7` | `ea8f3bf6e196fc163a30dcb580af8cd4b77b9509b6f018cf8c9681ee9b7329c7` |

Both files come from `seanebones-lang/btcpredictor` at
`aaac31375effca4d862e719d90ac078b8fb7696b`. The brief describes the selected
routine's dependency, while the complete module contains application and analysis
imports. Reading the full source established the extraction boundary. The
reviewed consumer removes those imports, preserves interior assignment behavior,
requires stable string identifiers, and explicitly handles zero/one split
endpoints. A maximum digest can round to 1.0 after floating-point normalization;
endpoint handling avoids assigning A at a full B split.

The reviewed [standalone example](../examples/assignment-consumer/README.md)
passes **12 behavior checks**, including fixed upstream vectors, exact threshold
and endpoint cases, fresh interpreters, invalid inputs and CLI behavior. The
original generated output and its six checks remain distinct from this reviewed
adaptation. MD5 is non-security bucketing; colon-separated identifier ambiguity is
preserved and documented. These checks do not prove statistical quality, upstream
correctness or a component license audit. The catalog's independent-test flag
was not changed.

The six-file downloadable archive has SHA-256
`e99e4dbe7b9a87b5c7503d898f3048193b0a10397a180ae2081281317890ef14`.
A second, fresh workspace downloaded the served archive, checked its exact
allowlist and regular-file modes, retained the notice unchanged, and passed all
12 tests on Python 3.14.5 without installing Python packages. The example requires
Python 3.9+; local verification alone does not prove every supported interpreter.

### Blind frozen catalog evaluation

Ten fresh read-only Codex sessions each received only one evaluation question,
the installed MCP tools and an answer schema. Expected answers and reference
calls stayed outside the sessions' workspace. **10/10 answers matched exactly**
across **44 native MCP calls**. Every question inspected at least two relevant
parts, search limits stayed at most ten, and completed event traces contained no
shell/file operations or private tools. The snapshot revision remains
`984de759101f3a54f44fe135206151eb1c882c0270747f0b98d8f7c1614a6a48`.
The [sanitized result record](../examples/mcp-evaluation/codex-results.json)
includes actual calls, reported usage and per-question answers.

This is one run on authored frozen questions, not held-out accuracy, adoption,
changing-catalog behavior or a broad model/host benchmark. Fixture filtering and
ordering differ from production search. Source reuse and private contributions
are outside this score. The host accepted the adapter's nullable schemas in
these trials; Inspector portability advisories still apply to other hosts.

### Application and packaging validation

- **194 offline checks:** 144 application, 3 parser consumer, 12 Python consumer,
  12 CLI, 13 MCP protocol and 10 frozen evidence replays. CI invokes no model.
- Production build, typecheck, formatting and full dependency audit passed; the
  audit reported zero vulnerabilities. MCP and CLI archives are unchanged.
- The new worked-example page rendered without browser errors or warnings and
  without page overflow at widths 375, 639 and 1280. The viewport was restored.
  Raw browser walkthrough frames and a screenshot were retained locally; they
  do not record the native CLI sessions themselves.
- The opt-in native runner documents the same isolated host configuration and
  saves future trials separately. Its syntax/help passed, and a mocked Codex
  process checked isolated configuration, credential-environment exclusion, ten
  answer round trips and failure on a prohibited action. These are orchestration
  checks; the real recorded trials used the original local launchers. Native reruns consume
  the signed-in Codex account's allowance and never run automatically in CI.

No new Anthropic request, live-owner credential, draft or public listing was
created. Main catalog counts remain 7 listings, 34 parts, 9 summary runs and zero
agent credentials/drafts. This establishes a working local native host path and
a reviewed consumer. Container execution, public deployment, changing-catalog
scale and other hosts remain unverified. Raw evidence is retained in ignored
`artifacts/agent-host-pilot-events.jsonl`, `artifacts/codex-evaluation-results.json`
and `artifacts/assignment-consumer-proof.json`.

## Deployment readiness follow-up — 2026-10-08

The previously open local container gate is now checked with a successful Linux
arm64 Docker build and thirteen disposable mounted-volume/startup/crash/restore
checks. CI adds the same drill on Linux amd64. Nine new operations checks bring
the offline suite to 203. No real credential or new repository analysis is used.
The two example gzip platform tags are normalized, yielding the current assignment
archive hash in [HOSTING.md](HOSTING.md); earlier hashes remain dated evidence.
MCP and CLI packages keep their existing identities. Public hosting, production
OAuth/provider behavior and load remain separate gates; see the hosting runbook
and latest [review milestone](REVIEW.md).
