# Required context: matched consumer trial

This epoch tests whether a fresh agent can distinguish a required implementation
gap from sufficient source evidence under an explicit adaptation contract.

Three authored pairs run through the production focused-evidence engine:

| Pair | Gap packet | Matched control |
| --- | --- | --- |
| Rust packet allowance | `src/helper.rs` read but omitted with `packet-budget` | Same source and synthetic commit; larger packet supplies the whole helper |
| Go context reads | `z_helper.go` left unread after notice and three peer reads | Same caller/helper contents with unrelated peers removed; helper supplied |
| Rust conditional module | `#[cfg(feature = "selected")]` conservatively rejects following `src/helper.rs` | Same helper contents with the controlling attribute removed |

Each caller delegates to a helper with freshly authored arithmetic constants. The
missing body prevents reconstructing its exact behavior from the supplied evidence.
Each matched control supplies that body. Tasks are identical within each pair and
explicitly permit adaptation when the required implementation is supplied.

`corpus.json` contains synthetic sources and derived synthetic commit identifiers;
these are not fetched GitHub repositories or additions to the live catalog. The
fixtures use this project's MIT notice. Their complete source is parser input only,
never compiled, imported or executed. Only reviewed standalone agent adaptations
can reach a compiler.

## Frozen procedure

`input-seal.json` binds 38 input files before all first turns: corpus, hidden
controls, schema, tasks, evidence, observed reads, independent arithmetic vectors,
acceptance files and drivers. Commit `a32aa1f` records that freeze before model use.

The existing Codex account supplies six separate tool-free `gpt-6.1-sol`, low-effort
sessions. Each receives only its task, focused response and output schema. Hidden
controls, full corpus and acceptance tests are withheld. The prompt asks for an
`adapt` or `needs_context` decision, a finding, supplied reference IDs and exact
needed paths/reasons. A required gap must produce empty code; guesses and stubs do
not satisfy the contract. Raw traces and exact first responses are retained with
hashes and completed-turn/tool-event verification. There are no repair turns.

An implementing-operator review checks decisions, citations and every proposed
source byte before compilation. The three negative turns must remain uncompiled
and unexecuted. Positive adaptations run in disposable compiler-only directories
against 518 independently calculated integer vectors per control. Rust repeats in
debug and optimized modes. Go uses local toolchains with module downloads disabled.
Review and execution records remain distinct; exact first-result records keep their
original pending-review/not-run stage markers.

## Observed first results

All six first responses conformed to the frozen decision/citation contract. The
three gap responses identified the required path and exact reason and returned no
code. All three controls supplied reviewed adaptations and passed 518 independent
vectors each without repairs. Rust passed both compiler modes; Go passed its local,
offline compiler check. These results used rustc 1.95.0 and Go 1.27.2 on macOS ARM64;
repository CI also replays them on native Linux AMD64.

## Replay

With repository dependencies installed, offline checks are:

```sh
node --test tests/missing-context-consumers.test.mjs
npm run test:native
```

Set `SALVAGE_RUSTC` and `SALVAGE_GO` to explicit compiler paths if needed. Go 1.24+
and a Rust compiler supporting edition 2021 are sufficient. Each positive control
can also run directly from its directory: `rustc --edition=2021 --test acceptance.rs
-o acceptance && ./acceptance`, or `GOTOOLCHAIN=local GOPROXY=off GOSUMDB=off GOWORK=off
GOENV=off go test -count=1 .`. Retain its MIT `LICENSE` alongside any reused code.
No provider calls, source-network requests or captured fixture execution occur in
regression and acceptance.

To conduct a new provider epoch, create an `artifacts` directory for the shared
native harness. Do not overwrite first results or change this epoch's frozen rubric.

## Limits

These are six guided first turns on authored fixtures, with implementing-operator
review. The stop instruction is explicit, and the hidden scorer uses exact recorded
gap reasons. Results measure conformance to this contract, not spontaneous caution,
statistical agent reliability, full dependency closure, build-condition resolution,
upstream compatibility or independent blind review.

The paired source changes and packet allowances are controlled conditions. The
arithmetic is deliberately simple so implementation behavior can be checked without
executing the fixture repository. Real-world positive cross-file extraction remains
covered separately by the preceding [Rust/Go source trial](../cross-file-consumers/README.md).
A supplied helper does not make every warning disappear; agents must still identify
which source is required for the selected standalone contract.
