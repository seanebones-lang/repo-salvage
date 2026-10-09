# Scoped supporting source within the existing allowance

Coverage-v4 preserves complete-file context when it fits, then adds complete Python
supporting AST nodes for declarations whose module remains absent. Module name
loads, imports, assignments and future statements carry exact source locators.
Explicit function locals are filtered, while defaults/annotations/decorators are
observed in their enclosing context. Repeated, conditional, deleted, annotation-only
and wildcard bindings stay gaps. Supporting class members are selected by spelling,
not proven receiver types; the whole class stays omitted when it cannot fit.

`contexts[].same_file_reference` is unchanged: scoped blocks never satisfy it.
`scoped_contexts` records supplied references, gaps and bounded omitted observations.
The parser observes at most 24 known module names and 8 fallback members; packet
support takes fair turns for at most 16 nodes per target. Another supplied primary's
support is represented by its own context entry. Zero omitted observations is not
complete scope resolution or a dependency closure. Dynamic binding, attribute
receivers, nested scopes, import/initialization effects and external dependencies
remain uncertain. No upstream source is imported or executed.

## Frozen diagnostics

Controls, complete pinned Git blobs, exact production requests, the trusted engine,
isolated parser and native harness were sealed before either model session.
Required targets, supporting citations and review points stay outside model input;
owner context is null. These are diagnostic questions on two specific source
families, not a universal analysis-quality score or new publication authority.

| Profile                                            | Evidence characters | Observed result                                                                                                                                            |
| -------------------------------------------------- | ------------------: | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Retained `dbader/schedule` full analysis           |    66,816 of 70,000 | Scheduler selected; complete Job constructor and execution member cited; full Job/module and scheduling-helper gaps retained                               |
| Fresh `python-humanize/humanize` focused `intword` |     8,376 of 12,000 | Formatter selected; magnitude thresholds, labels and finite-value helper cited; conditional type binding and missing localization implementation disclosed |

The scheduling capture remains pinned to
`82a43db1b938d8fdf60103bd41f329e06c8d3651`. Humanize is a fresh project corpus for
these trials, public, non-fork and MIT at
`785e5dcc0d0308ad0dff3f6cc0faa7085ad0375b`. The formatter's single-target focused
scope was authored before the run; it tests interpretation and supporting citations,
not unprompted discovery. Fresh to these trials does not mean absent from model
training. Both responses passed structural verification, the pre-run citation gate
and source review by the implementing operator; no independent review is claimed.

Primary target identities are unchanged against coverage-v3 on both captured
profiles. Supporting context is a tradeoff: the earlier focused formatter packet
could supply the complete i18n module instead of its missing local magnitude tables.
Coverage-v4 supplies those local tables and helpers but leaves i18n absent. These
runs do not establish general improvement or a causal prompt effect. Full-module
omissions, prior failures and all earlier seals remain intact.

The native responses correctly distinguish the new source from remaining gaps.
Scheduler's execution member can cancel before invoking a callback, updates last_run
and calls an absent scheduling helper, with callback exceptions uncaught there.
The formatter discloses conditional NumberOrString, floating-point precision and
uncaught overflow/formatting failures, and absent translation initialization. These
are source interpretations, not executed correctness results or runnable extractions.
No original scheduling/Humanize source, upstream tests or new adapted consumer was
executed. Existing independently exercised consumers remain separate evidence.

## Replay and transport checks

`seal.json` binds pre-run inputs. `results.json` preserves exact native responses
and their original `manualReview: pending` stage marker; `review.json` records the
completed source review separately. `results-seal.json` binds both and the derived
transport fixture back to the input seal. The epoch owns a fixed trusted archive
loader, leaving earlier sealed loaders unchanged. Target captures remain data.

Two tool-free native sessions used Codex CLI 0.160.0, `gpt-6.1-sol`, low reasoning
and the existing Codex account allowance. Usage was 45,736 input tokens (zero cached
input reported) and 2,056 output tokens. No API-key model calls were made. The CLI
has no equivalent of the application's 4,000-output-token cap, and this does not
change the deployed provider transport. Raw traces remain private ignored artifacts.

`focus-fixture.mjs` derives a focused response from the sealed source and reproduces
the exact formatter packet. Listing 990 and owner 99001 are synthetic transport
identities; repository/commit/blob source identity is real and sealed. The fixture
is not a live catalog listing or a recorded GitHub request sequence. CLI 0.5.1 and
MCP 0.3.4 replay its constants, references and disclosures end to end, and reject
malformed links or false complete-context pointers. Whole file bodies can be checked
against their SHA-256; partial excerpts cannot independently verify a file hash.

Replay offline without model calls or source-network requests:

```sh
node --test tests/scoped-context-evaluation.test.mjs
npm run test:evaluation
npm run test:cli
npm run test:mcp
```

The operator entry point requires explicit account-use arguments, compares the
current production engine/parser with the pre-run archive, preserves failures and
refuses to overwrite results. This completed epoch must not be refrozen or rerun
in place. Future changes need a new epoch. Live catalog listings, summary history
and analysis jobs were not changed by these diagnostics.

After these runs, source review found a single-statement module locator collision.
Production now reuses an existing complete-file locator instead of shadowing its
kind with a new statement reference. A regression covers imports/assignments under
all four policies. This changes production engine bytes; the completed native
epoch still replays its original archived engine. Neither captured request changes
under the collision fix, and no model run or prior record was repeated or rewritten.
