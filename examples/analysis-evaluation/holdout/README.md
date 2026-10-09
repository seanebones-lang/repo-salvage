# Real-source evaluation, 2026-10-09

This epoch contains eight **author-constrained** cases on two public MIT repositories,
captured through the production `indexedSnapshotRepo` implementation. The implementing
Codex agent selected the source, wrote and froze the rubric, then reviewed the answers.
It is not independent review, an unconstrained discovery benchmark or eight independent
repositories. The six positive cases identify eight required targets; two cases exercise
author exclusion. Both models received the same production prompt, evidence and schema.
Expectations and review points stayed outside their workspaces and requests.

The source and rubric were committed at `aade77c` before the first generation. After
these runs this epoch is a **regression set**, not an unseen holdout. Do not change its
rubric or re-freeze requests to make a model pass. A future engine/prompt change should
preserve this dated evidence and introduce a versioned evaluation epoch.

## Provenance and reproduction

- [Humanity-Grid source](https://github.com/seanebones-lang/Humanity-Grid/tree/3e6c736b2b73f2b2f747c13358f37c8c371f2ff1)
  was pinned to `3e6c736b2b73f2b2f747c13358f37c8c371f2ff1`.
- [AI-Voiceover source](https://github.com/seanebones-lang/AI-Voiceover/tree/a4c5c3721b719ccfee680556d128775837213adf)
  was pinned to `a4c5c3721b719ccfee680556d128775837213adf`.

`corpus.json` preserves complete captured file bodies, Git blob hashes, tree paths,
inspection passes and exclusions. Each body was checked against its pinned Git blob.
Offline re-indexing produced exactly the same index and packet JSON as the live
production inspection. The original source is data; it is never imported by the
analyzer or evaluation runner. Root licenses and applicable project notices remain
inside the corpus and under `notices/`. Third-party scientific inputs and binary
proof artifacts were not included as executable fixtures or relabeled as MIT code.

`cases.json` contains the pre-generation expectations, required target groups and
source review points. `seal.json` hashes the corpus, rubric and every exact request.
All eight requests are rebuilt and checked **before any provider call**. A changed
source body, rubric, prompt, schema or evidence selection stops the batch.

The offline checks require no network, login or provider credential:

```sh
npm run test:evaluation
```

Explicit repeat commands consume the operator's existing Codex account allowance:

```sh
node examples/analysis-evaluation/run.mjs --codex gpt-6-luna --holdout --effort high
node examples/analysis-evaluation/run.mjs --codex gpt-6.1-sol --holdout --effort low
```

The runner starts a fresh tool-disabled ephemeral CLI context per case, with an empty
read-only workspace containing only the output schema. It makes at most eight case
invocations, never repeats a case automatically, and stops on a transport failure.
CLI-internal connection retries are not independently controlled or measured by this
harness. Each invocation has a 120-second limit and a five-second termination grace.
Missing completion events, malformed traces, tool events and failed turns are rejected.
Raw answers, events and diagnostics stay in private ignored artifact directories.
An operator can also explicitly use `--anthropic MODEL --holdout` with a current
credential; no Anthropic calls were made for this epoch.

## Observed results

The [reviewable results](results.json) include all sixteen answers, request and answer
hashes, trace hashes, usage, latency, selection scores and implementing-agent review.
These are single runs of different reasoning configurations. Codex adds its own
model-specific context; reported input token counts differ despite identical application
requests. CLI account usage is not an API dollar estimate, and this is not a completed
cross-provider comparison.

| Configuration    | Structure/references | Required selection | Source review     | Median latency |
| ---------------- | -------------------- | ------------------ | ----------------- | -------------- |
| GPT-6 Luna, high | 8/8                  | 8/8                | 7/8; one omission | 8.62 s         |
| GPT-6.1 Sol, low | 8/8                  | 8/8                | 8/8               | 16.73 s        |

No tool events were observed. Both configurations selected every required target and
honored both exclusions. Sol named extraction helpers and edge conditions more explicitly.
Luna's prosody explanation omitted that several early-return paths bypass numeric
clamping. That boundary matters when a consumer expects normalized output; it is
recorded as a material omission rather than concealed by the selection score.
No material unsupported claim was identified in this implementing-agent review.

Four consumer checks exercise three explicitly reviewed, Git-blob-pinned slices:
the complete pure prosody module, the CSRF extractor with its header constant, and
the Python hash declaration with its standard-library imports. The isolated emotion
function fails without its same-file helpers; the complete reviewed module works.
The checks also confirm clamping bypass, clone scaling, header precedence, lack of
token validation, empty-file hashing and hashing across the 1 MiB chunk boundary.
They install no upstream packages and execute no upstream app, verifier main function,
provider request or arbitrary catalog component. NumPy/Polars behavior, audio quality
and C2PA conformance have not been consumer-tested here.

## The larger gap is evidence coverage

| Repository    | Inspected files | Indexed targets | Targets supplied to the model |
| ------------- | --------------- | --------------- | ----------------------------- |
| Humanity-Grid | 54              | 123             | 17                            |
| AI-Voiceover  | 64              | 83              | 24                            |

Those counts are inventory coverage, not useful-component recall. Six deliberately
chosen additional source probes expose two failure stages:

- Three Humanity-Grid targets were inspected and indexed but excluded from the bounded
  packet: the arXiv request method, work-unit splitter and Rust application file target.
- Three AI-Voiceover utilities were absent from the inspection allowance: the prosody
  tag parser, TTS cache key builder and fallback rate limiter.

Thus zero of these six probes reached either model. The models cannot recover source
the server does not supply. The current packet favors early sorted targets, and file
inspection spends a substantial allowance on route directories before later utilities.
The next engineering step is fairer bounded source/target selection and explicit
same-file extraction context. Preserve these failures as baseline evidence; assess an
improvement on a new frozen corpus before making discovery-quality claims.

Luna remains a promising efficient-model candidate, but this run does not establish
a dollar-cost winner or justify replacing the hosted adapter. Independent rubric and
answer review, broader natural discovery cases, repetitions, additional languages,
unsuitable/stub code, conflicting notices, a successful second-provider run and live
hosted-provider validation remain open.
