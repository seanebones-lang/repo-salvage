# Evidence-based analysis engine

Implemented 2026-10-09. This replaces prefix sampling in the owner publication
path. Existing listings and their identifiers are left intact until the owner
deliberately requests re-analysis. Hosting remains outside this milestone. Provider comparison is an explicit
operator evaluation, separate from publication.

## Source inspection before interpretation

The application resolves one source commit, requires a complete Git tree, and
reads eligible regular UTF-8 source files, documentation, manifests and notices.
Complete downloads must match the pinned Git blob hash. A symlink, malformed
path, generated/vendor directory, unsupported encoding or oversized source is
recorded as excluded. Nothing in the repository is installed or executed.

Limits are explicit: 10,000 tree entries, 64 inspected files, 128,000 bytes per
file and 2,000,000 source bytes per repository. Directory round-robin selection
avoids exhausting the allowance in one directory. The broad pass reads at most 48 files and 1.5 MB, with at most 12 metadata
files. Up to 16 reserved reads follow known missing local dependencies, likely
test filenames and notices; each new dependency can expose another missing import.
Unused capacity returns to broad discovery. Total limits remain 64 files and
2 MB, with a two-minute source-read deadline and ten-second request timeouts.
Inspection history records the initial, follow-up and fill paths. Filename matching
only chooses tests to inspect; observed imports still determine association.
Tests and dependencies may remain omitted, and every omission is recorded.

The TypeScript parser identifies exported function implementations, classes and
initialized variables in complete JS/TS files. Parse errors and truncated files
cannot supply a complete declaration. Python functions, async functions, classes and direct class methods use a trusted
standard-library AST helper with Python 3.11 grammar. Decorators and complete
bodies retain exact UTF-8 source ranges; method targets explicitly require their
enclosing class context. The helper receives source as stdin data through
`python3 -I -S`, a minimal environment, a five-second process timeout and output
limits. Linux also caps CPU time and address space. Target code is never imported
or executed. Invalid/newer grammar and incompatible encoding withhold targets.
A missing/failed parser falls back to complete-file evidence with explicit gaps.
Other languages receive complete-file targets with uninspected-import context.
File fallback also applies when no recognized declaration exists.

Static imports and re-exports are inspected at module level. Relative imports
are resolved against the pinned tree and followed transitively with cycle
detection. Computed imports and common aliases are explicit gaps; skipped,
incomplete and unparsed supporting files produce gaps too. A bare import is an
observed specifier, not proof a package is installed or actually required by the
selected declaration. Python package-relative imports and unique root/`src` module paths are inspected
conservatively. Ambiguous paths and dynamic imports remain gaps. This does not
reconstruct Python runtime search paths, namespace packages or imported-symbol
bindings. Custom tsconfig aliases, same-file helper closure,
framework configuration, runtime side effects and dependency versions are not
fully resolved. `local_imports_complete` deliberately remains false.

Test association requires a statically observed import of the candidate module;
it does not establish that the test covers a particular export or passes. Notice
paths are discovered heuristically; root SPDX metadata still is not a per-file
license audit. Inspection/download manifests retain their notice checks.

## Bounded evidence and provider boundary

The evidence packet supplies up to 24 candidate targets and complete source
blocks, within a 70,000-character evidence allowance. A declaration that cannot
fit is omitted, never cut into a prefix. Additional context is included when it
fits; indexing a dependency does not imply its body was supplied to the model.
The final serialized request has a separate 100,000-character guard and a
4,000-output-token allowance. Character bounds are not a monetary budget.

Each supplied block has a reference ID, file path, line range and SHA-256 for the
complete inspected file. The model selects target IDs and supplies descriptions,
categories, guidance, limitations and reference IDs. The server attaches target
identity, observed imports, supporting/test paths and source locators. Model
fields cannot set review status, execution evidence, source hashes or identity.
Invalid/duplicate targets, missing primary references, unavailable references,
malformed explanations and inconsistent outcomes reject the entire new result.
The existing listing is preserved. A valid `no_candidates` outcome is accepted.
If no complete target can fit, the result is produced without a provider call.

References make explanations inspectable; they do not prove their meaning is
correct. Generated prose remains a model interpretation. No automatic model
retry, fallback, shell tools, publication tool or repository execution is added.

`AnalysisProvider.generate` accepts a bounded request and returns text plus
provider-reported metadata. The Anthropic adapter remains the one installed live
adapter; a deterministic fixture provider verifies that the engine does not
depend on Anthropic response objects. The initial indexed release used only offline provider fixtures. The subsequent
[frozen interpretation controls](../examples/analysis-evaluation/README.md) ran
four native Codex CLI 0.160.0 sessions with explicit `gpt-6.1-sol`, low reasoning,
no tool events, valid references and the expected selections. Source review found
no material unsupported claims in those four answers. This is implementing-agent
review of authored controls, not an independent real-repository holdout.
The configured Anthropic model trial stopped on HTTP 401 after one request.
There is no completed two-provider quality comparison or dollar-cost winner.

Codex is a candidate for the next model comparison. Official integrations include
the [Codex SDK](https://learn.chatgpt.com/docs/codex-sdk) and
[non-interactive execution](https://learn.chatgpt.com/docs/non-interactive-mode).
An operator-controlled evaluation is distinct from a hosted multi-user service.
Do not copy a developer's personal authentication material into a web container.
Choose runtime integration, credentials and budgets explicitly after evaluation.

## Durable analysis jobs

Owner approval now queues a SQLite job and returns immediately after eligibility and
commit checks. `/dashboard/jobs` lists the owner's latest 50 jobs; each job page
polls a session-authenticated, `private, no-store` progress endpoint. Agent bearer
credentials cannot start paid jobs or read this endpoint. Draft approval retains
its credential scope, expiration, moderation and pinned-commit checks.

The queued job stores the numeric repository/owner IDs, selected commit, requested
model, edited note, draft ID and an idempotency key. It stores no OAuth or provider
credentials. The same submission key and effective context return the same retained job,
including terminal jobs; changed context under that key is rejected. A refreshed
form also reuses matching active work and remembers its key after completion.
Each job accepts at most 32 such keys; further submissions must use its progress
page. Keys expire with the job record or explicit owner removal. Allowances are reserved once at enqueue.
The queue admits at most 20 active jobs globally and two per owner.

`ANALYSIS_WORKER_ENABLED=1` starts the worker through Next.js Node instrumentation.
It runs in the long-lived application process, requires a persistent SQLite volume,
and is disabled during builds and Edge loading. This is a single-instance deployment
architecture, not a serverless queue or an independently scalable worker service.
The worker continues recovery housekeeping without a configured provider key but
cannot dispatch new generation until a key is configured. `/api/health` returns 503
if the enabled worker is missing or its timer has not ticked for 30 seconds.

Jobs advance through `queued`, `inspecting`, `generating` and `publishing` to a
terminal status. An atomic 60-second lease admits one worker at a time across
processes; a ten-second heartbeat renews it. Every write and publication is fenced
by the current lease and owner authorization. The worker freshly checks public,
non-fork ownership and a recognized license by numeric repository ID before source
inspection, before interpretation and before publication. It uses public-data
credentials, never a persisted owner's bearer token. Renames retain numeric identity
and use current names when publishing the pinned commit.

Recovery is deliberately asymmetric:

| Last durable state                                | Restart behavior                                                                            |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Source inspection interrupted before a checkpoint | Inspect the same commit again, at most three inspection attempts.                           |
| Source checkpoint saved, provider not dispatched  | Reuse the checkpoint and make the originally approved request.                              |
| Provider intent saved, no response saved          | Pause as `needs_attention`; no automatic provider retry. The request may have been charged. |
| Response saved, validation interrupted            | Revalidate the stored response without another generation.                                  |
| Validated result saved, publication interrupted   | Recheck ownership and authorization, then publish the saved result.                         |
| Listing and job success committed                 | Return the saved success; publication and job completion share one SQLite transaction.      |

A provider intent and request hash are committed **before** dispatch. A response is
committed **before** evidence validation. Each checkpoint/response/result field is
capped at 2 MB; the indexed checkpoint retains evidence supplied to interpretation
and index metadata while discarding other source bodies. The database is private
and ordinary backups include active job state. A saved response from an older
application version must pass the currently installed evidence validator to resume.

Jobs have a one-day lifetime. Expiration, cancellation, revoked/dismissed/expired
draft authority, or explicit owner removal prevent late publication. Terminal jobs
scrub stored source/response/result bodies; their private progress records are
retained seven days, and published analysis history follows existing retention.
Removing a listing deletes its related job records too. Provider requests already
sent cannot be recalled; cancellation is a publication boundary. A deliberate new
attempt selects the current branch commit, consumes another allowance and may incur
another charge. Uncertain requests are never described as charge-free. A queued
approval remains approved if operators later lower the daily allowance to zero;
stop the worker or cancel jobs to halt existing approvals.

The local tests and container recovery drill use disposable SQLite databases,
synthetic requests and fixture responses. They verify recovery and publication
fencing without making paid calls. They do not establish provider billing behavior,
production OAuth behavior, or a real model request killed in flight.

## Identity, history and backwards compatibility

New component IDs derive from source path, symbol and target kind; changing a
display name or moving a declaration's lines does not change its ID. Source
hashes/reference IDs change with source revision. Identity is scoped by listing;
symbol/file renames create a new target. Legacy IDs retain their old algorithm.

Append-only analysis/review snapshots preserve previous summaries, source commits
and model labels in `analysis_revisions`. They contain metadata and locators,
not repository source bodies. Review snapshots remain separate observations;
re-analysis still clears current reviews. History is private to the recorded
owner, displays the latest 50 snapshots at `/dashboard/history/{id}`, and is
deleted with explicit owner removal. Existing rows are archived on the next
review or re-analysis, not silently rewritten at startup.

`/api/v1/parts` and its inspection route retain their prior strict response
schemas. They conservatively expose the old evidence vocabulary. Indexed
evidence is available through `/api/v2/parts` and
`/api/v2/parts/{id}/{part}`. OpenAPI contains separate Search/Part and
SearchV2/PartV2 schemas. Version 2 search supports:

```sh
curl 'http://127.0.0.1:3187/api/v2/parts?declaration=complete&imports=resolved'
repo-salvage inspect LISTING_ID PART_ID --api-version 2 --base https://YOUR_HOST
```

`declaration=complete` requires a complete parsed declaration supplied to analysis.
`imports=resolved` excludes recorded source-context gaps, including a Python
method's enclosing-class requirement; it does not establish
standalone execution or complete runtime dependencies. The updated MCP adapter
uses version 2. The CLI defaults to version 1 unless version 2 or evidence filters
are selected. Existing adapters need no automatic upgrade to keep using version 1.

## Offline benchmark and next evaluation

Run `npm run test:analysis`. Ten frozen authored cases contain seven expected
declarations and three negative cases. The new packet supplies 7/7 complete
targets; the former size/prefix policy supplies 1/7. Four authored pure-function
declarations also execute in fresh Node consumer directories. The report is
written to ignored `artifacts/source-benchmark.json`.

This benchmark tests deterministic source coverage and authored consumer behavior.
It does not measure real-repository discovery recall, model interpretation
quality, license correctness or arbitrary code extraction. The real-SQLite flow
test uses mocked GitHub/provider transport and covers a tail declaration,
invalid-output preservation, review history, and successful no-candidate analysis.

Before choosing a model, freeze real component evidence packets and an unseen
holdout set, with reference expectations reviewed independently of generated
answers. Include useful and unsuitable candidates, missing/dynamic dependencies,
same-file helpers, conflicting notices, large files and no-candidate repositories.
Evaluate the same packets and schema for every provider. Record exact model,
prompt/schema/index version, response references, latency, token usage and billing
estimate. Score supported explanations, material omissions, candidate selection
and fresh-consumer success; do not use model self-confidence as a quality score.
Retain failures and compare repetitions without changing fixtures to fit answers.

The Python parser and bounded follow-up inspection are implemented.
Durable background jobs are now implemented. A separate
[real-source evaluation](../examples/analysis-evaluation/holdout/README.md) freezes
eight constrained cases on two pinned public MIT repositories. Luna/high and
Sol/low both passed all structural and required-selection checks; implementing-agent
source review found one Luna omission about numeric-clamping bypass. Sol supplied
more explicit extraction context in this small sample. This is not independent
review, natural discovery recall, a repeated-run estimate or a dollar-cost comparison.

The evaluation also identified six source probes that never reached the model:
three indexed targets omitted from the packet and three files absent from inspection.
Fairer bounded source and target selection, explicit extraction context and a fresh
independently reviewed corpus should precede choosing and live-verifying the hosted
provider adapter. Automatic installation/execution of arbitrary repository
code is not part of the public analyzer.

The real-source milestone adds ten offline evaluation/consumer checks, bringing
the full local suite to 287 checks. Archived model answers replay their exact
request hashes, structural/reference validation and required-selection scores.
Type checking, formatting, production build and dependency audit passed; the
audit reported zero vulnerabilities. The live preview remained healthy, with
seven listings, 34 briefs, nine summary runs and no analysis jobs. Listing and
summary-run rows matched the private pre-job backup exactly. The sixteen explicit
Codex evaluation invocations used the operator's account allowance; no Anthropic
calls or hosted catalog analyses were made for this milestone.

## Job milestone validation

The 2026-10-09 validation passed 277 offline checks: 218 application tests,
nine deployment/backup checks, three parser-consumer checks, 12 Python-consumer
checks, 12 CLI checks and 23 MCP/replay checks. Type checking, formatting,
production compilation with the worker flag enabled, and dependency audit also
passed; the audit reported zero vulnerabilities. The build did not start a worker.

Seventeen arm64 container checks passed, including SIGKILL recovery of saved
source and response checkpoints, an uncertain request remaining paused, private
progress access, replacement-container storage and backup/restore. The drill used
no real credentials or provider calls. CI repeats the container drill on Linux amd64.
A separate disposable, signed-in browser fixture verified that polling changes a
queued job into owner-attention controls and displays the possible-charge warning
without a page reload or a model call. The ordinary local preview reports
`database: "ready"` and `worker: "ready"`.

An online private backup preceded the local migration. The seven real listings,
34 candidate briefs and nine recorded analysis attempts remained unchanged; the
serialized catalog row hash matched before and after startup. No pilot repository
was re-analyzed during this milestone. Hosting and a live provider restart/billing
experiment remain unvalidated.
