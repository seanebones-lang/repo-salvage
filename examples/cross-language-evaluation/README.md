# Four-language source-to-consumer diagnostic

This epoch captures four public MIT repositories not used in the project's earlier
corpora. They are fresh to these project trials, not a model-training holdout.
It tests six authored tasks over a disposable production catalog containing ten
unedited native-generated parts. The catalog is deliberately small and has no
prior-catalog distractors. It does not establish general search recall.

| Repository                | Pinned source                              | Analysis granularity    |
| ------------------------- | ------------------------------------------ | ----------------------- |
| `lukeed/clsx`             | `925494cf31bcd97d3337aacd34e659e80cae7fe2` | JavaScript declarations |
| `pillarjs/path-to-regexp` | `7dd6f8f7bd63ae8bffca0968144508228dc61729` | TypeScript declarations |
| `rapidfuzz/strsim-rs`     | `dacc84c0dc61eff0ee0ff66962bcf2e17018ad26` | Rust file fallback      |
| `dgryski/go-rendezvous`   | `9f7001d12a5f0021fd3283525f888b5814ccee27` | Go file fallback        |

## Chain and separation of gates

1. The production `indexedSnapshotRepo` sampler retrieved pinned public source.
   Complete captured UTF-8 files were corroborated against the Git tree's blob
   SHA-1 and independently recorded SHA-256. Captured source remains data;
   upstream modules, tests and build tools were not executed.
2. `seal.json` freezes the corpus, six tasks, source fragments, exact four
   coverage-v4 production requests and trusted application engine before model
   use. There are no owner nomination hints. `history/engine.json` is an
   allowlisted archive of this application's code, separate from target captures.
3. Four isolated native Codex sessions generated briefs. Structural acceptance
   is separate from source interpretation. `analysis-results.json` retains the
   original `manualReview: pending` markers; `review.json` records the subsequent
   implementing review without overwriting them.
4. The four generated summaries were inserted unchanged into a disposable
   SQLite database served by the standalone production application. No live
   listing was published. `generated-seal.json` freezes those rows, the actual
   production catalog and installed MCP 0.3.4 archive before task-driven discovery.
   Production search, inspection and reads verified live public GitHub identity
   and pinned source; this was not a simulated MCP response server.
5. Six fresh native sessions used only the four enabled read tools. Queries and
   candidates were chosen by the model. Scoring requires a bounded search,
   source-bound inspection, exact relevant file windows and complete notices
   for recommendations; rejection tasks still require inspecting relevant source.
   `discovery-evidence.json` preserves structured tool responses for offline score
   replay, while raw native event streams remain private artifacts.
6. After successful class-composition discovery, `consumer-input-seal.json`
   freezes the complete source and notice actually read by MCP, a separate
   adaptation task and six hidden acceptance checks. A fresh tool-free session
   proposed `consumer.mjs`. Its first output was retained without edits, including
   the complete original MIT notice and pinned attribution.
7. A separate process copied the proposed module and acceptance tests into a
   fresh temporary directory. `consumer-execution.json` records six passing
   checks, including 1,000 deterministic comparisons with a token-accumulating
   reference model. Only the adaptation was executed. The original proposal's
   `execution: not_run` marker remains intact; execution and review have their
   own sealed records.

The adapted contract exports `classes(...values)` and deliberately restricts
object handling to enumerable own string keys. It preserves raw strings and
numbers, input order and duplicate tokens. It adds no HTML escaping or
normalization. Callers must escape at an output boundary. Inputs must be acyclic;
getters and recursion depth are not hardened. These tests cover authored examples
and a bounded generated input family, not arbitrary JavaScript objects.

## Reproduce without model calls

From the application checkout after `npm ci`:

```sh
PATH="/opt/homebrew/bin:$PATH" node --test tests/cross-language-evaluation.test.mjs
node examples/cross-language-evaluation/check-consumer.mjs --check
```

The replay uses frozen captures and the trusted archived application engine.
It performs no model calls and does not contact GitHub. The consumer acceptance
copies only its two authored module/test files to a temporary workspace.

Operator tools `freeze.mjs`, `run.mjs`, `serve.mjs` and `consumer-run.mjs` document
how the completed trial was conducted. They require explicit arguments and refuse
model-result overwrites. Do not rerun this epoch; copy its harness into a new
folder, select a new corpus and freeze new controls. `serve.mjs` requires a
separate port and an explicit built checkout matching the frozen engine/package;
it omits provider credentials, uses its own database, sets analysis allowances to
zero and cleans up its temporary runtime on exit.

## Interpretation limits

One implementing reviewer examined source-specific claims. No independent or
blind review was performed. Four-language retrieval does not imply Rust or Go
AST support: their entries remain whole-file fallback with import inspection
explicitly unresolved. A summary can discuss multiple algorithms in one part,
so declaration-level targeting, ranking and dependency context remain weaker.
The Go brief and discovery answer both identify `Remove`'s out-of-range slice
access and other mutation defects; static initial-node lookup is the conditional
starting point, not a ready mutable membership service. No upstream fix,
upstream test result, distributed coordination or persistence is claimed.

The native sessions used `gpt-6.1-sol` with low reasoning through the existing
Codex account allowance and disabled shell, filesystem, web and other tools.
There were no API-key model calls. Recorded token usage is not a dollar price.
This diagnostic does not certify source correctness, dependency/license closure,
production hosting, unconstrained discovery, public adoption or independent
consumer coverage for the other three languages.
