# Fresh source → generated briefs → native discovery → independent consumer

This single trial connects the production analysis request and verification to
native MCP discovery and a separately tested consumer. Earlier discovery trials
started with authored catalog descriptions. Here the disposable database contains
only the six briefs returned by the analysis model and verified by the application.
No operator-authored descriptions were substituted.

The capture is a fresh public, non-fork MIT Python repository,
`tkem/cachetools@9976f1a8076631560f49c5b0dfda7e4d00ee0a4a`. Its 22 complete
captured files match their pinned Git blobs. Target source was parsed as data,
never imported or executed. The consumer task, source controls and acceptance
tests were frozen before either model run. The analysis request has no owner note
or consumer task. The discovery prompt contains no repository, path, listing ID,
part ID or expected search query; expected answers and source fragments stay in
the operator's controls outside the agent workspace.

## Separate gates and the retained miss

- The old coverage-v1 packet indexed 144 targets but omitted `LRUCache` from its
  24 supplied targets. Many tiny private helpers preceded the larger public class.
- Coverage-v2 gives public Python top-level declarations an earlier turn within
  each file, while retaining private helpers and enclosed methods for inspection.
  `LRUCache` now reaches the packet. This is a naming heuristic, not an API or
  dependency guarantee. The same file-turn and character limits still apply.
- The full cache module did not fit in the 70,000-character packet. The server
  records the missing context. The model returned six structurally valid briefs,
  including `FIFOCache`, but **did not select `LRUCache`**. This analysis-selection
  gate remains failed. There was no hidden retry or changed rubric.
- A separate fresh agent first searched `LRU cache` with Python/MIT filters and
  received no match. It broadened to `cache`, inspected the FIFO brief, and read
  the complete MIT notice and a 12,000-character pinned source window containing
  `Cache` and `LRUCache`. Five public MCP calls met the pre-frozen source binding,
  exact fragment, notice and bounded-search gates. There were no prohibited tools.
- The proposed count-only LRU mapping passed all ten pre-generation tests, including
  2,000 deterministic operations against a reference model, in a clean Python
  consumer workspace. The operator reviewed it before execution; its source was
  not edited after generation. No upstream module or upstream test was executed.

The chain succeeded through source recovery despite the brief-selection miss.
It does not prove that a catalog brief names every useful part, that an agent will
always broaden a search, or that this result generalizes. Public declaration
ordering does not solve bounded same-file context or six-brief selection. Those
remain the next analysis-quality questions.

## Records and operator use

`seal.json` binds the pre-run corpus, request, controls, task, acceptance tests and
harness. `generated-seal.json` separately binds the actual verified response,
summary, seeded listing, served catalog and adaptation host before discovery.
`analysis-results.json`, `adaptation-results.json` and `review.json` preserve both
the miss and recovery. Raw native events and diagnostics remain private under
ignored `artifacts/full-chain-*` directories with mode 0700 and files 0600; public
records contain their hashes and sanitized results.

Both runs used `gpt-6.1-sol` at low reasoning through Codex CLI 0.160.0 and the
existing ChatGPT account login. Analysis used 31,142 input tokens and 1,664 output
tokens. Discovery/adaptation used 122,141 input tokens, including an 87,424 cached
subset, and 1,810 output tokens. These are account usage, not API dollar billing;
no API-key model calls were made. Native CLI output is schema constrained but has
no equivalent to the application's 4,000-output-token provider cap. This operator
harness does not implement a Codex backend in the deployed analysis worker.

The input epoch retains the original operator `run.mjs`. An OpenAPI contract update
for coverage-v2 changed the packaged MCP archive before discovery, so the separately
sealed `adapt.mjs` uses MCP 0.3.2 and its own recorded archive hash. The analysis
record and its input seal were preserved. Both hosts refuse overwriting results.
MCP 0.3.2 accepts coverage-v1 and coverage-v2 evidence packets.

Offline verification makes no model calls or source-network requests:

```sh
node --test tests/full-chain-evaluation.test.mjs
npm run test:cache
```

The completed epoch must not be refrozen or rerun in place. Future trials need a
new input epoch, captures, controls and seals. The operator sequence used here was
`run.mjs --analyze MODEL EFFORT`, generation validation and isolated catalog sealing,
then `adapt.mjs --adapt http://127.0.0.1:3192 MODEL EFFORT`. `serve.mjs --serve PORT`
starts the already sealed evaluation catalog in a disposable database; it copies
the production build without environment files, disables paid analysis allowances,
and removes its owned runtime and database on shutdown. Port 3187 is rejected.
The fixture's repository owner ID enables public-source verification; it does not
represent an owner nomination, review or permission to publish a live listing.

This is one source repository, one consumer task and one implementing reviewer.
The corpus is fresh to this project's evaluations, not demonstrably unseen in
model training. No live catalog listing, summary history or analysis job changed.
No independent-review badge, public listing, deployment or external adoption
result follows from these checks.
