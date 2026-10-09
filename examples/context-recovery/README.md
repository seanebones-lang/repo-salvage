# Pinned helper recovery

This epoch tests the step after an evidence-only stop: retrieve the required file
through the installed MCP tool, preserve the original gap and pinned identity, and
adapt only from successfully supplied source.

| Case | Initial gap | First recovery outcome |
| --- | --- | --- |
| Rust packet allowance | `src/helper.rs`: `packet-budget` | Exact helper supplied; standalone adaptation passes |
| Go read allowance | `z_helper.go`: `not-inspected` | Exact helper supplied; standalone adaptation passes |
| Rust conditional module | `src/helper.rs`: `restricted-module` | Exact helper supplied; adaptation passes while feature selection remains unresolved |
| Go corrupted transport | Same caller, helper and commit as the Go recovery case | Git blob mismatch; empty code and continued stop |

The three earlier packets and exact `needs_context` responses are copied from the
preceding [missing-context epoch](../missing-context-consumers/README.md). Each is
carried into a **fresh native session**, not a persistent host resume. Source files,
constants and synthetic commit identifiers remain authored fixtures, not fetched
GitHub repositories or additions to the live catalog.

## Procedure and trust boundary

Commit `34eb105` records 35 sealed input files before the native calls, including
contracts, corpus, initial packets, prior stops, expected retrieval responses,
independent vectors, scoring, fixture, native driver and compiler acceptance. The
seal also binds the standalone MCP archive. Hidden controls, complete corpus,
expected retrieval responses and acceptance files are not in the agent workspace
or prompt.

Each Codex CLI 0.160.0 session uses the existing ChatGPT account, `gpt-6.1-sol` at low
effort, an empty ephemeral read-only workspace and a fresh archive installation with
installation scripts disabled. User configuration, rules, project documents,
shell tools and web search are disabled. Only `repo_salvage_focus_evidence` is enabled.
The model receives its task, initial packet, prior stop and output schema. It must
request the exact helper with the initial listing ID and a 24,000-character packet
allowance, match repository/commit, preserve original gap history and retain limits.

The actual installed MCP adapter connects over stdio to the host and HTTP to a
disposable loopback fixture. The fixture runs the current production evidence
engine against mocked pinned Git trees and bytes. Complete-file Git blob validation,
source parsing and packet construction run normally. The corrupted case alters the
transport bytes while retaining the expected tree hash; the engine returns
`source_integrity_failed`, and no helper content reaches the agent.

The fixture does not exercise production database visibility, fresh GitHub ownership
checks, authentication, rate limits or the complete application route. Other
repository tests cover those boundaries. No original fixture source is imported,
compiled or executed. No real GitHub source requests or provider API-key calls occur.
Native sessions consume the existing Codex account allowance.

## First results and acceptance

All four first decisions conformed to the frozen recovery contract. Each made one
MCP call, retained the original gap and exact pin, and cited only supplied references.
All three adaptations retained the full MIT notice and passed 518 independent
integer vectors each, with no repair turns. These reuse the independently calculated
vectors from the earlier matched controls; no fixture code computes expected answers.
Rust passed debug and optimized modes;
Go passed offline compilation. The conditional Rust adaptation explicitly retained
`conditional_module_unresolved` and `upstream_build_unverified`. The corrupted Go
response retained `not-inspected`, recorded verification failure, returned no code,
and remained uncompiled and unexecuted.

The implementing operator inspected every first response and proposed source byte
before compiler use. Review and execution have separate records and hashes. Exact
first-result files retain their original pending-review/not-run markers. Traces,
HTTP/source-read records, proposed code and review/execution records are bound by
`results-seal.json`. Local acceptance used rustc 1.95.0 and Go 1.27.2 on macOS ARM64;
CI repeats compiler checks on native Linux AMD64.

## Replay and limits

With repository dependencies and explicit local toolchains available:

```sh
node --test tests/context-recovery.test.mjs
npm run test:native
```

`SALVAGE_RUSTC` and `SALVAGE_GO` can name compiler paths. Regression makes no model
calls and executes no fixture repository source. Native acceptance compiles only
the reviewed standalone adaptations in disposable directories; Go module downloads
are disabled. Preserve the accompanying MIT notice when reusing an adaptation.

These are four guided first attempts on deliberately small authored arithmetic
contracts, with implementing-operator review. They establish conformance to this
handoff/retrieval contract, not spontaneous recovery, general agent reliability,
complete dependency closure, upstream build compatibility, conditional compilation
resolution or independent blind review. No server-side adaptation gate or catalog
certification is added. To run another provider epoch, create new inputs and records;
never overwrite these first results or change their sealed acceptance criteria.
