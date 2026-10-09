# Discovery among competing parts

The [original run](results.json) produced ten exact answers, but only nine of ten
met the frozen evidence requirements. The durable shared-work case searched only
the JavaScript facet and missed the TypeScript scheduler. Its conclusion was
accurate for the inspected candidates; the stronger competitor-coverage control
failed. That failure remains in the original record.

MCP 0.3.1 clarifies source language versus runtime compatibility in the search
description, language field and guide. Two separately frozen
[diagnostic rechecks](language-followup-v2/results.json) used the same negative
questions, catalog, source controls and rubric. Both passed, with unfiltered
searches and inspection of all three required competitors. These known-case
repeats do not establish causation or a general reliability improvement.

This epoch tests qualification after discovery: parts can share queue, limit,
asynchronous and cancellation vocabulary while implementing different guarantees.
It contains ten authored requests, eight recommendations and two unsupported
requirements. Requests supply no repository names, paths, identities or queries.

The catalog combines the earlier 34 parts with six operator-authored evaluation
entries for public MIT source from `sindresorhus`: p-limit, p-queue, p-throttle,
p-debounce, p-memoize and yocto-queue. These are maintained libraries used as
competitors, not claims that they are abandoned or available through the public
Repo Salvage catalog. Descriptions were written after source inspection; this
trial does not measure whether the analysis model would produce those briefs.

`corpus.json` preserves 22 complete pinned files, their Git blob and SHA-256 hashes,
the selected repositories' numeric identities and original MIT notices. Selected
files include primary implementations, manifests and the scheduler's local
modules. Capture inspected text only; upstream code was never executed or its
dependencies installed. The source-control facts in `controls.json` and the
manual review requirements in `cases.json` were recorded before model use.

## Isolation and the production path

`serve.mjs` creates a disposable database and copies the built standalone server
into a private temporary directory, excluding environment files. It seeds only
that database. All search, filtering, relevance ranking, inspection and focused
reads use the production application; public identity and pinned trees are checked
against GitHub. The installed MCP package reads source directly from pinned GitHub
URLs, with its usual whole-file Git verification and text-window bounds.

The evaluation server binds loopback on a separate port. It receives no provider
credentials, has zero analysis allowances, and cleans up its database and runtime
on shutdown. Optional existing `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` environment
values authenticate the server's public GitHub verification requests. Neither is
copied into the agent's environment or output. Anonymous GitHub quotas may prevent
an unauthenticated run; that is an infrastructure failure, not a missing candidate.
The real catalog, analysis jobs, summaries and publication workflow are untouched.

Native sessions use an explicitly selected model and reasoning effort through an
existing ChatGPT login. Their workspace contains the installed MCP package and
output schema only, without the expected answers, source controls or corpus.
Only four read tools are enabled; shell, filesystem actions, web, private drafts
and subagents are prohibited. Raw traces stay under ignored private `artifacts/`
directories. There are no automatic retries or API-key model requests.

## What counts as passing

A completed native trace and an exact `repository:primary_path` answer are
necessary. A recommendation must also have search, inspection bound to the same
listing and commit, byte-matching relevant source fragments, and the complete
matching license notice. The negative cases require source from all three
plausible queue/limit competitors; reading an unrelated file cannot establish
`NO_MATCH`. A scheduler's first text window cannot establish cancellation behavior
that appears later in the file. Focused evidence can qualify when its supplied
blocks contain the relevant verified source.

This scoring establishes that relevant evidence was available to the agent.
Narrative configuration, behavior and caveats still need a manual review against
the pre-recorded requirements. It does not automatically certify the conclusion
or the upstream component. `tests/competing-discovery-evaluation.test.mjs` checks
wrong commits, different listing identities, altered bytes, false offsets,
incomplete notices, missing competitors, omitted behavior, unbounded searches
and incomplete turns. CI runs these offline checks; it never starts model sessions.

`seal.json` freezes the cases, corpus, controls, seeded listings, production catalog,
installed MCP archive and harness files. An evaluated epoch must not be refrozen
or edited to fit its results. Use a new directory for a changed corpus or rubric.

## Reproduction

Build first, then keep the disposable server running in one terminal:

```sh
npm run build
node examples/competing-discovery-evaluation/serve.mjs --serve 3191
```

After verifying that catalog contents and the archive match the existing seal,
run the explicitly authorized native trial in another terminal:

```sh
node examples/competing-discovery-evaluation/language-followup-v2/run.mjs --run http://127.0.0.1:3191 MODEL low
```

This reproduces the two diagnostic tasks using MCP 0.3.1. The original ten-task
`run.mjs` requires the earlier MCP 0.3.0 archive matching its seal. Rebuild that
archive from commit `0504e0d395f2c2a464fd296be3295adad6ccc946` in a separate checkout
and use it as `public/repo-salvage-mcp.tgz` in an isolated evaluation workspace.
The harness refuses to silently substitute a newer package.

The frozen epoch already has a seal. `freeze.mjs --freeze ORIGIN` is only for the
first pre-model freeze of a new epoch; it refuses an existing seal. Reproduction
requires the same MCP archive. Fresh upstream visibility checks may fail or exclude
repositories that have changed availability since capture, even though commits
remain pinned. Preserve those failures as results rather than rewriting the seal.

## Interpretation boundary

The original run used Codex CLI 0.160.0, `gpt-6.1-sol`, low reasoning, ten fresh
sessions and 81 MCP calls: 15 searches, 19 inspections and 47 file reads. One empty
search recovered through later queries. The two diagnostic sessions used the
same model profile and 31 calls: six searches, six inspections and 19 reads.
Neither run used focused evidence. All turns completed; no prohibited tool event
or API-key model request occurred. The original run recorded 1,005,610 input
tokens (678,784 cached, a subset) and 7,029 output tokens; the diagnostics recorded
268,344 input (188,288 cached) and 2,056 output. These are account usage figures,
not a provider dollar-cost comparison.

These cases were designed and reviewed by the implementing agent. All six new
libraries share one author and JavaScript/TypeScript ecosystem. They were absent
from our previous evaluation corpora, but may be familiar to the model from its
training. The catalog is small and the new descriptions are authored. This is
neither a blinded assessment, a model-training holdout, a multi-language recall
estimate, proof of independent consumers, nor evidence of demand or adoption.
