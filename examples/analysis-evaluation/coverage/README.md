# Bounded coverage regression

This 2026-10-09 epoch uses the same two pinned public MIT repositories as the
[historical evaluation](../holdout/README.md), with the new production inspection,
coverage-v1 packet and context-aware prompt. Complete inspected source is frozen
in corpus.json with Git blob hashes. The [preserved license and notice files](../holdout/notices)
apply to these exact upstream commits too. Target applications were not installed
or executed. Only five explicitly reviewed, hash-pinned slices have consumer tests.

Four cases cover cache-key extraction, global prosody-tag adjustments, a CLI work-unit
splitter and owner exclusion. Expectations and source-review points in cases.json
stay outside generation requests. seal.json records source/rubric/request hashes
before generation. This is implementing-agent review of known-repository regression,
not independent assessment, unseen discovery, unconstrained recall or a provider comparison.

At the same 64-file, 24-target and 70,000-character bounds, candidate evidence
spans 18 instead of four files in Humanity-Grid and 24 instead of 11 in AI-Voiceover.
All six historical probe files are inspected; three probes are direct selectable
targets, and four have complete-file context in the packet. The unexported fallback
limiter appears as context for an exported target, not as a direct target. The
arXiv method and Rust application file remain outside the packet. These six known
probes do not estimate whole-repository recall. Library-name and smaller-block
preferences can still defer large, entrypoint or unconventionally named code.

The complete-file context count is eight of 18 targets for Humanity-Grid and
22 of 24 for AI-Voiceover. Missing context is explicitly disclosed in new briefs;
complete context does not certify dependency closure or successful extraction.

Freeze only before generation:

```sh
node examples/analysis-evaluation/freeze-coverage.mjs --freeze
node examples/analysis-evaluation/run.mjs --codex YOUR_EXPLICIT_MODEL --coverage --effort high
```

The runner uses disabled tools and existing native Codex account allowance.
No hosted-provider migration, API dollar estimate or catalog re-analysis is implied.
The frozen source/rubric/requests were committed at `f9f6226` before either run.
The dated [results.json](results.json) preserves all eight answers, canonical/raw
answer hashes, trace hashes, reported usage, timings and implementing-agent review.

| Configuration | Structure/references | Required selection | Source review      | Median latency |
| ------------- | -------------------- | ------------------ | ------------------ | -------------- |
| Luna, high    | 4/4                  | 4/4                | 2/4; two omissions | 7.25 s         |
| Sol, low      | 4/4                  | 4/4                | 4/4                | 18.79 s        |

Neither run emitted a tool event. Both identified required same-file helpers and
honored exclusions. Luna omitted the NUL tuple ambiguity and did not clearly
explain global versus per-span prosody behavior or unknown/unmatched markup.
Sol described those boundaries explicitly. No material unsupported affirmative
claim was identified in this review. These observations do not establish a
repeated-run quality difference or dollar-cost winner.

Three additional consumer checks on two reviewed exact blobs confirm cache-key
trimming/defaults, helper requirements, NUL tuple ambiguity, tag handling, global
adjustments and clamping. The work-unit CLI was inspected but never executed;
JobSpec validation and dependency behavior remain unknown. All 16 historical
answers also continue to replay their original sealed requests unchanged.

The eight invocations used existing Codex account allowance. No Anthropic API
request or real catalog analysis was made. CI replays answers offline and checks
that completed epochs reject re-freezing. Selecting a hosted provider still
requires broader/independent assessment and a successful live adapter evaluation.
