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
file and 2,000,000 source bytes per repository. Hierarchical round-robin selection
balances sibling directory branches. Conventional `lib`, `utils`, `helpers`,
`core`, `algorithms` and `domain` areas receive an early discovery preference;
nested library subdirectories share their area's turn. Entrypoint/configuration
names receive a later turn. These are scheduling hints, not judgments about
usefulness, purity, safety or license eligibility. The broad pass reads at most
48 files and 1.5 MB, with at most 12 metadata files and 24 library-area files,
leaving initial capacity for other source areas. Up to 16 reserved reads follow known missing local dependencies, likely
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
Go and Rust use the isolated CST process described below. Remaining languages receive complete-file targets with uninspected-import context.
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
fit is omitted, never cut into a prefix. Python public top-level declarations
receive an earlier turn than private helpers and enclosed methods; this naming
hint does not prove an API or dependency completeness. Private targets remain
eligible. The earlier coverage-v1, coverage-v2 and coverage-v3 ordering is retained for frozen evaluation
replay. Policy `repo-salvage/coverage-v4` gives
files one candidate turn at a time, preferring conventional library areas. Within
a file, implementation shape, observed module dependencies, syntactic same-file
binding references and declaration size affect scheduling. Binding observations
are not a complete closure or scope analysis. Seventy percent of the allowance
is reserved for primary selections; a single larger complete block may use the
whole allowance. Notices precede complete same-file context, then supporting/test
files and manifests. For same-file context, coverage-v3 and coverage-v4 defer private-only Python
declaration files; selected public Python declarations and other languages retain
normal turns, with size breaking ties. This does not remove private targets or
prove an API. Every JSON field and escape counts toward the allowance.

When a Python declaration lacks a complete same-file body, coverage-v4 can add
`scoped_contexts`: complete supporting AST declarations and statements, including
imports, assignments and future imports. Unique unconditional module bindings
are matched to syntactic name loads. Explicit function locals are excluded from
body observations; defaults, annotations and decorators still use enclosing-scope
observations. Repeated, conditional, deleted and annotation-only bindings are
reported as gaps, as are wildcard imports. Dynamic binding and nested scopes
remain incomplete; these are not exact extraction dependencies.

A supporting class that does not fit stays omitted. Complete constructor/member
excerpts may be offered from constructor and attribute spellings, without
synthesizing a class header or proving receiver types. Supporting nodes take fair
turns across selected targets, at most 16 distinct nodes per target; parser name
observations cap at 24 and fallback members at 8. Gaps cap at 12, with additional
observations counted. An absent scoped entry means the observation was unavailable
or its metadata did not fit. Another supplied primary has its own context entry,
so wrappers link to it without duplicating its transitive metadata. Every complete
body, locator, gap and counter still counts toward the original allowance. A zero
omission counter does not establish complete dependencies. Scoped blocks take
priority over remaining supporting/test files and manifests, so one kind of context
can displace another. In archived coverage-v4, non-Python support uses complete file context.

Each selected target has a `contexts` entry identifying its complete same-file
reference, or null when that body did not fit. The prompt requires checking
helpers, types, constants, early returns and side effects in available context.
The distinct-capabilities-v1 instruction prefers distinct extraction capabilities
and avoids filling slots with thin wrappers when broader implementations are
evidenced. Six is a maximum, not a quota. This instruction is not a server-enforced
quality score or publication authority; the previous prompt remains available for
frozen replay.
The scoped-support-v1 prompt instructs the model to inspect and cite scoped blocks
while retaining full-module and scope/receiver uncertainty.
The server adds a missing-context limitation independently of model prose when
that context is absent, and a separate scoped-support limitation when scoped
observations exist. Legacy saved packets remain valid. Indexing a dependency
does not imply its body was supplied to the model; complete-file context still
does not prove that external dependencies or enclosing runtime context are complete.
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
The [coverage regression epoch](../examples/analysis-evaluation/coverage/README.md)
now measures fairer bounded file/target selection and explicit same-file context
against those same commits. This known-repository regression is separate from
the unchanged historical epoch. A fresh independently reviewed corpus should
precede choosing and live-verifying the hosted provider adapter. Automatic installation/execution of arbitrary repository
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

## Coverage milestone validation

The coverage policy is frozen before generation at `f9f6226`. Its new epoch
contains four known-repository constrained cases. Luna/high and Sol/low passed
4/4 structural/reference and required-selection checks each, with zero tool events.
Implementing-agent source review found two Luna omissions; Sol disclosed those
boundaries. This does not establish an independent quality or dollar-cost winner.
The old eight-case epoch and all 16 answers remain byte/hash reproducible offline.

On the same commits, supplied candidate evidence spans 18 versus four files in
Humanity-Grid and 24 versus 11 in AI-Voiceover. All six probe files are inspected;
three probes are selectable and four receive full-file context. The arXiv method
and Rust app target remain outside the packet. The unexported fallback limiter
is visible as context, not directly selectable. Full-file context fits for eight
of 18 and 22 of 24 candidates respectively. These are measured stage counts on
known probes, not whole-repository useful-component recall.

The local suite now contains 298 offline checks, including three new reviewed
consumer checks confirming cache serialization ambiguity and prosody-tag behavior.
Type checking, formatting, production build and dependency audit pass; audit
reports zero vulnerabilities. Seventeen arm64 container checks pass, with no
real credentials or provider calls. CI repeats the suite/container checks on
Linux amd64. The eight explicit model invocations use the existing Codex account
allowance; no Anthropic API calls or real catalog re-analyses are performed.

The next discovery milestone should expose bounded, recorded coverage gaps and
support focused or partitioned evidence requests without silently multiplying
provider calls. Broader source selection, non-exported helper exposure and
independent natural-discovery review remain open before hosted provider choice.

## Focused evidence milestone

Agents can now explicitly inspect omitted source through
`GET /api/v2/parts/{listing}/evidence`, CLI `evidence` and MCP
`repo_salvage_focus_evidence`. These public read-only requests use the existing
listing's pinned commit and make no provider call or catalog change. They expose
complete source blocks, same-file context, indexed/supplied counts and bounded
inspection gaps. Exact path/symbol requests select five of the six known probes;
the unexported limiter is reported as unindexed with containing-file context.
All six probe files reach the focused packet. This is exact-scope regression,
not unconstrained recall or an extraction/execution certification.

The focused reader shares source exclusions, Git blob verification and trusted
parsers with ordinary analysis. It inspects up to eight scope files and four
notice/dependency files, 64 KB per file and 256 KB total, within a 20-second
source-read deadline. Parser time is additional. Scope inventory caps at 32 files;
response size caps at 64 KiB, dropping complete blocks as needed. A bounded
60-second process cache coalesces identical requests and allows at most four
concurrent distinct inspections. Every response rechecks public identity and
local catalog state before returning source.

[Focused regression evidence](../examples/focused-evidence/README.md) preserves
production-reader responses at the same pinned commits, separate from the two
unchanged model-evaluation epochs. CLI and real stdio consumers replay the data
offline. The clean installed-package check verifies both downloadable clients;
CI runs it after build. No upstream application or new model evaluation is run.

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

### Fresh four-language interpretation and retrieval

The [cross-language epoch](../examples/cross-language-evaluation/README.md)
freezes four exact coverage-v4 production requests and six authored discovery
tasks before native model use. Four generated briefs and six installed-MCP
sessions passed their distinct structural and source-bound retrieval gates.
The complete source actually retrieved in one JavaScript task then supported a
first unedited adaptation that passed six isolated checks, including 1,000
bounded generated input comparisons. Source/notices, model response, implementing
review and adaptation execution remain separate records.

Rust and Go were retrieved through whole-file fallback parts. This evidence
supports limited file-level discovery, not declaration AST indexing, resolved
imports or dependency closure. The pinned Go removal defect was explicitly
reported by both analysis and discovery; static lookup remains a conditional
starting point. No upstream modules or tests were run. This four-source,
ten-part catalog is too small to establish general search recall or a language
performance comparison.

## Go/Rust concrete syntax and coverage-v5

Current analysis and focused evidence use coverage-v5. The trusted Node child reads
source as JSON stdin, parses with web-tree-sitter 0.27.1 and bundled official MIT
Go 0.25.0 / Rust 0.24.0 grammar WASM, and verifies grammar SHA-256 before loading.
It never imports, installs, compiles or executes target code. No target toolchain
is required. The child receives a minimal environment without provider secrets,
a five-second timeout, a 128 MB V8 heap setting, bounded input/output and bounded
node/observation traversals. The V8 heap setting is not a total process/RSS limit.
Malformed trees withhold declarations; unavailable/budget-exhausted parsing falls
back to explicit complete-file evidence. Grammar assets and runtime WASM are
traced into the standalone server and exercised in read-only container checks.

Go functions, receiver methods, grouped types and aliases retain complete units.
Rust functions, structs/enums/types/traits/unions, impls and direct impl methods
retain complete units and preceding attributes. Constants/statics and Go package
variables are supporting statements rather than primary parts. Opaque modules
and macro bodies are not advertised as extracted declarations. Duplicate symbol
names receive source-coordinate suffixes; conditional definitions remain gaps.

When full-file context is absent, `go-cst-names-v1` and `rust-cst-names-v1` supply
complete supporting units from unique same-file names, conservative member
spellings, observed Go receiver types and Rust enclosing impls. Local spellings,
ambiguous/conditional definitions, opaque modules/macros and wildcard imports
remain gaps. Every config/import statement is source context, not a requirement
to install its package. Go package peers, build conditions and initialization,
Rust module lookup, cfg evaluation, macro expansion, trait dispatch and runtime
behavior are not resolved. No zero-omission count proves dependency closure.
The previous packet policies remain available for frozen evaluation replay.

The [separately frozen consumer trial](../examples/rust-go-consumers/README.md)
uses exact pinned strsim-rs and go-rendezvous focused responses. One Rust and one
Go first proposal passed predeclared standalone acceptance after implementing-agent
review. The Go adaptation intentionally repairs the captured Remove defect and
changes the API to report validation/lookup/removal status. No upstream module
was compiled/executed, and no current listing or public catalog record was changed.
