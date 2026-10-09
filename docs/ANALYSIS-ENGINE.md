# Evidence-based analysis engine

Implemented 2026-10-09. This replaces prefix sampling in the owner publication
path. Existing listings and their identifiers are left intact until the owner
deliberately requests re-analysis. Hosting and new paid model evaluations are
outside this milestone.

## Source inspection before interpretation

The application resolves one source commit, requires a complete Git tree, and
reads eligible regular UTF-8 source files, documentation, manifests and notices.
Complete downloads must match the pinned Git blob hash. A symlink, malformed
path, generated/vendor directory, unsupported encoding or oversized source is
recorded as excluded. Nothing in the repository is installed or executed.

Limits are explicit: 10,000 tree entries, 64 inspected files, 128,000 bytes per
file and 2,000,000 source bytes per repository. Directory round-robin selection
avoids exhausting the allowance in one directory. Metadata/docs/notices precede
source and tests. Tests may consequently be omitted in a large repository; the
record reports omissions instead of claiming a complete repository scan.

The TypeScript parser identifies exported function implementations, classes and
initialized variables in complete JS/TS files. Parse errors and truncated files
cannot supply a complete declaration. Non-JS/TS languages receive complete-file
targets with explicit uninspected-import context. Python declaration parsing is
a subsequent adapter, not implemented here. File fallback is also used when
JS/TS exposes no recognized exported implementation.

Static imports and re-exports are inspected at module level. Relative imports
are resolved against the pinned tree and followed transitively with cycle
detection. Computed imports and common aliases are explicit gaps; skipped,
incomplete and unparsed supporting files produce gaps too. A bare import is an
observed specifier, not proof a package is installed or actually required by the
selected declaration. Custom tsconfig aliases, same-file helper closure,
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
depend on Anthropic response objects. No new live provider calls were made for
this milestone, and no Codex-versus-Claude quality winner is claimed.

Codex is a candidate for the next model comparison. Official integrations include
the [Codex SDK](https://learn.chatgpt.com/docs/codex-sdk) and
[non-interactive execution](https://learn.chatgpt.com/docs/non-interactive-mode).
An operator-controlled evaluation is distinct from a hosted multi-user service.
Do not copy a developer's personal authentication material into a web container.
Choose runtime integration, credentials and budgets explicitly after evaluation.

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
`imports=resolved` excludes recorded static-import gaps; it does not establish
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

After that comparison: add the chosen provider adapter, Python declaration
support, bounded follow-up source inspection and resumable background jobs as
separate validated increments. Automatic installation/execution of arbitrary
repository code is not part of the public analyzer.
