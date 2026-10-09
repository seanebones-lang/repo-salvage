# Cross-file consumer trial

This epoch tests a narrow question: can a fresh agent turn a selected declaration and
supporting source from another file into a working standalone adaptation?

Two first proposals use pinned evidence produced by the current focused-source path:

- Rust adapts `div_rem_1e16` in `dtolnay/itoa` together with `src/u128_ext.rs`'s
  multiply-high helper. The result splits every `u128` into a quotient and remainder
  for division by 10^16 using reciprocal multiplication.
- Go adapts streaming XXH64 from `cespare/xxhash`, including the pure-Go
  `writeBlocks` implementation in `xxhash_other.go`. The result supports seeded
  one-shot hashing, bounded streaming state, reset and non-mutating digest reads.

Both use the MIT license option. Keep each directory's exact `LICENSE` alongside
its adaptation. The Rust source is pinned to
`1577ed901354d0d7448ac162328f9dbf5183124c`; Go is pinned to
`ab37246c889f9db16b606fda1c232d659df9271d`. These are synthetic evaluation listing
IDs, not additions to the live catalog.

## Run independently

A checkout of this repository and the language compiler are sufficient. No web
server, JavaScript dependencies, provider credential or upstream package is needed.

```sh
cd examples/cross-file-consumers/rust
rustc --edition=2021 --test acceptance.rs -C overflow-checks=yes -o /tmp/salvage-cross-file-rust
/tmp/salvage-cross-file-rust --test-threads=1
```

```sh
cd examples/cross-file-consumers/go
GOTOOLCHAIN=local GOPROXY=off GOSUMDB=off GOWORK=off GOENV=off go test -count=1 -v .
```

The Go example requires Go 1.24 or later. The Rust example uses edition 2021 and
standard-library arithmetic only. Repository CI also repeats Rust acceptance with
optimization and overflow checks disabled. `npm run test:native` copies the reviewed
adaptations and acceptance files into disposable directories, checks their seals,
and runs both the preceding same-file examples and this epoch. Optional
`SALVAGE_RUSTC` and `SALVAGE_GO` select explicit local compiler paths.

## Evidence and acceptance

`input-seal.json` hashes the tasks, evidence, acceptance files, independent oracle,
license notices and drivers before either proposal. The input freeze was committed
as `ca80f0a` before the model calls. Tests are withheld from both agents. The existing
Codex account supplies separate tool-free sessions using `gpt-6.1-sol`, low effort;
no API key is used. Raw completed-turn traces, exact first responses and exact
source bytes are retained. Both first proposals passed their frozen acceptance contracts without repairs.
Rust passed debug and optimized builds with rustc 1.95.0; Go passed with Go
1.27.2 on macOS ARM64. There is no repair step in this epoch.

Each proposal must cite the selected declaration and the supporting file. These
citations are checked against the packet. The operator then inspects the adapted
source, records a hash-bound review, and only afterwards permits compilation.
`review.json` and `execution.json` distinguish source review from actual execution.
The original upstream captures are parsed and inspected as data; they are never
installed, imported or executed.

Rust acceptance compares against built-in division and remainder, reconstructs the
input, and checks remainder bounds. It covers 65,536 small values, powers of two,
decimal quotient boundaries, the maximum `u128`, and 131,072 deterministic
full-width comparisons, in both compiler modes.

Go acceptance uses 2,094 frozen vectors. An authored Python integer oracle follows
the [XXH64 specification](https://github.com/Cyan4973/xxHash/blob/v0.8.3/doc/xxhash_spec.md)
and is checked against all nine official numerical
[XXH64 sanity vectors](https://github.com/Cyan4973/xxHash/blob/v0.8.3/cli/xsum_sanity_check.c)
before proposal generation. No upstream C or Go implementation is executed to
produce expected outputs. Tests cover seeds including `uint64` maximum, byte and
block boundaries, twelve streaming chunk widths, caller mutation after `Write`,
repeated digest reads, writes after a digest read, empty writes and reset.

## Limits

This is a controlled two-example trial with operator review. It demonstrates these
adaptations under the frozen contracts; it does not establish comparative agent
performance, full upstream compatibility, performance parity, exhaustive arithmetic
proof or safe execution of arbitrary repository code. Citations plus source review
show the cross-file adaptation, but cannot prove that the agent lacked prior
knowledge of either algorithm.

The Rust packet still lacks a complete root file and retains unresolved upstream
configuration. The Go packet contains mutually exclusive assembly and safe-string
variants, and explicitly marks `xxhash_unsafe.go` unread. The standalone Go proposal
must choose the supplied pure-Go path and remove platform selection requirements;
the packet does not certify build-tag resolution or package dependency closure.
XXH64 is a non-cryptographic hash. This example supplies no thread-safety or zero-value
`Digest` contract; initialize it with `New(seed)`.

To reproduce provider proposals in a new epoch, create an `artifacts` directory
before using the existing native-run harness. Preserve this epoch unchanged rather
than overwriting any first result or changing its acceptance criteria.
