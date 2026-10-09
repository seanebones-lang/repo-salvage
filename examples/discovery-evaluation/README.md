# Ordinary-request discovery evaluation

Ten authored developer requests ask for capabilities without supplying repository
names, paths, part identities or search strings. Eight have a known starting point;
two require `NO_MATCH` because the inspected source cannot establish the requested
distributed persistence or factual accuracy. The implementing agent verified
source controls before freezing the suite. This is a small, known-corpus evaluation,
not an unseen-repository holdout or external-user accuracy estimate.

The [cases](cases.json), [source controls](controls.json) and [34-part catalog](catalog.json)
are protected by [a pre-run seal](seal.json). The XML export has the same questions
and expected answer strings. Preserve this epoch; create a new one when changing
questions, expectations or catalog contents. Existing analysis and MCP epochs are
unchanged.

## Recorded discovery run

On 2026-10-09, ten fresh Codex CLI 0.160.0 sessions used explicitly selected
`gpt-6.1-sol`, low reasoning, and the downloadable MCP 0.3.0 archive installed with
scripts disabled in a disposable workspace. The production API supplied search
ranking, manifests and source; its catalog matched the frozen snapshot before and
after the run. Expected answers and control source were not copied into the host
workspace. Only the four public MCP tools were enabled. Shell and web tools were
disabled, and completed event traces were checked for prohibited operations.

[Results](results.json) record 10/10 exact answers with search, inspection and
actual source evidence, across 57 native tool calls. Three empty searches were
recovered by the model's subsequent queries. The model used search, inspection
and verified file reading; it made **zero focused-evidence calls** in this trial.
This result therefore does not measure when agents choose the newer focused tool.
Manual comparison with the pre-run source controls found the behavioral
explanations and key limitations supported. The reviewer was the implementing
agent; this was not blinded or independent certification.

The traces also exposed useful adaptation limits: the prose splitter can lose
whitespace, repeat a prefix and emit oversized unbroken words; POST stream
cancellation can still leave retry timers; signing serialization does not establish
publisher trust or factual accuracy. Finding a suitable starting point is distinct
from accepting it unchanged.

Model use consumes existing Codex account allowance, with no Anthropic or API-key
model calls. Recorded usage is cumulative across fresh requests: 951,776 input
tokens, including 663,296 cached input tokens, and 5,503 output tokens. Cached input
is a subset of input; do not add it again. No dollar or cross-model cost comparison
is established. Raw traces remain private in ignored artifacts; their recorded
hashes alone are not independent validation.

## Explicit operator runs

```sh
npm run build
node examples/discovery-evaluation/run.mjs --run ORIGIN MODEL low
```

Requires an existing ChatGPT CLI login and the original archive and catalog
matching the seal. There is no automatic login, API-key setup, retry or invocation
from CI. Each question has a 180-second limit plus termination grace. Successful
process exit alone earns no credit: completed turns, permitted native tools,
correct answers and matching repository/path source evidence are required.
Public reads consume the installation's normal quota. Offline tests validate the
scorer's rejection of incomplete turns, tool errors, wrong-repository source and
notice-only evidence.

The [adaptation task](adaptation-task.md) is separately sealed with operator-owned
consumer checks before its model run. `--run-adaptation ORIGIN MODEL low` generates
proposed Python code through a fresh read-only host. It does not execute that code.
Review and consumer validation occur separately; see the
[prose consumer](../prose-consumer/README.md).
