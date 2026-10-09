# Bounded context and distinct-capability selection

This epoch measures the next analysis-quality questions from the retained
[full-chain LRU miss](../full-chain-evaluation/README.md). It has two known-source
diagnostic profiles on cachetools and one fresh public MIT scheduling corpus.
Controls, complete pinned source, requests, coverage and the trusted engine were
sealed before the first model call. There were no owner notes or consumer task
hints in the requests; required symbols, groups and redundancy controls stay
outside model input.

## Changes and observed results

Coverage-v3 preserves coverage-v2's primary targets and public Python declaration
ordering. It defers complete context for files whose selected Python declarations
are all private or enclosed methods, allowing public-declaration context and other
languages their normal turns. File size breaks ties, notices still precede context,
and complete bodies either fit or remain explicitly absent. Private declarations
stay eligible. This is a naming heuristic, not a claim about API or extraction
quality. Both old policies remain available for historical replay.

On `tkem/cachetools@9976f1a8076631560f49c5b0dfda7e4d00ee0a4a`, the unchanged
24 targets now receive the full cache module, including `Cache` and `_DefaultSize`,
within 70,000 characters. The complete private memoization modules no longer take
that context space first. Their missing context is recorded; no truncated bodies
are sent in its place.

| Frozen profile                                            | Selected parts | Required target | Authored capability groups | Redundant wrapper pairs | Manual source review |
| --------------------------------------------------------- | -------------: | --------------- | -------------------------: | ----------------------: | -------------------- |
| Cache, new context and old prompt                         |              6 | LRUCache        |                          3 |                       0 | Pass                 |
| Cache, new context and diversity prompt                   |              5 | LRUCache        |                          3 |                       0 | Pass                 |
| Fresh scheduling source, new context and diversity prompt |              4 | Scheduler       |                          3 |                       0 | Pass                 |

The new `distinct-capabilities-v1` interpretation instruction asks for distinct
extraction capabilities, useful public entry points with supplied context, and no
six-slot quota. It permits distinct algorithms or policies and keeps source and
owner-exclusion rules. It is a preference in the analysis prompt, not a server
rejection rule or a publication permission. The JSON schema, verification rules
and 4,000-output-token application allowance remain unchanged.

The context-only run selected LRU and cited its full module under the old prompt.
The diversity run selected LRU/FIFO policies, two different argument-key policies
and a locked memoization helper, using five slots. It omitted the extra supporting
hash class selected by the old prompt. Both runs accurately disclosed the locked
helper's missing full module context. The prior six-brief LRU miss is preserved.

The fresh capture is `dbader/schedule@82a43db1b938d8fdf60103bd41f329e06c8d3651`,
with six complete pinned files. Its 31,983-character scheduling module still does
not fit alongside the packet's other evidence. The analysis selected Scheduler,
nearest-weekday adjustment, ordered format parsing and a registration decorator,
while naming missing module/Job context and making no isolation or passing-test
claims. Individual Job methods are supplied; the complete Job class and its
construction/execution implementation are not. This is a retained context limit,
not a newly closed gate. No scheduling source, upstream test or new consumer was
executed.

The authored grouping and wrapper-pair rubric measures these particular source
families. One run per profile cannot isolate a statistical prompt effect, establish
general recall, prove that five candidates are better than six, or show that public
names are always more useful. The old prompt also succeeded with improved context.
The scheduling corpus is fresh to this project's trials, not demonstrably absent
from model training. Reviews are by the implementing operator, not independent.

## Reproduction and boundaries

`seal.json` binds inputs and the pre-run harness. `results.json` retains the exact
native response records and their stage marker `manualReview: pending`; the final
manual review is recorded separately in `review.json`. `results-seal.json` binds
both outputs back to the original input seal. `history/engine.json` archives trusted
application modules and the isolated AST parser, so offline request/response replay
survives later production changes. Upstream captures are always parser input data;
they never enter the trusted module loader. Its historical profile paths are fixed
by the repository, and unknown paths are rejected.

Three fresh, tool-free native sessions used Codex CLI 0.160.0, `gpt-6.1-sol` and low
reasoning. Total usage was 89,187 input tokens (zero cached input reported) and
4,671 output tokens. This uses the existing Codex account allowance; no API-key
model calls or dollar-cost comparison were made. Native CLI output has no equivalent
to the application's 4,000-output-token cap. This does not implement a Codex transport
in the deployed worker. Raw events and diagnostics remain in ignored private
`artifacts/full-chain-*` directories; public records contain their hashes.

Run offline without model calls or source-network requests:

```sh
node --test tests/context-diversity-evaluation.test.mjs
npm run test:evaluation
```

The completed operator run was `run.mjs --run MODEL low`. It requires explicit
account-use arguments, verifies the production engine against the pre-run archive,
uses the same request/schema as the application, prohibits tools, saves failures,
and refuses to overwrite an existing result. This completed epoch must not be
refrozen or rerun in place. Future profiles require new captures, controls and seals.

MCP 0.3.3 accepts coverage-v1, coverage-v2 and coverage-v3 packets. Refresh the installed
archive for focused reads against the new server policy. Earlier adapter archives
and evaluation seals remain tied to their historical versions.

No public catalog listing, summary history or analysis job was changed. No source
execution, extraction certification, independent-review badge or adoption result
follows from these analysis checks. The next question is scoped supporting-definition
evidence for large modules that cannot fit as complete same-file context.
