# Rust and Go standalone consumer trial

Two pinned MIT sources from the previous cross-language corpus now support exact
focused declarations. Routing IDs 991/992 are offline fixtures, not catalog
listings. No database write or repository publication occurred.

| Source                                                          | Focus                     | Packet                                                                                 | Adapted acceptance                                                                                                          |
| --------------------------------------------------------------- | ------------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| rapidfuzz/strsim-rs, dacc84c0dc61eff0ee0ff66962bcf2e17018ad26   | src/lib.rs, levenshtein   | 12,000 characters; complete function plus bounded supporting units, full module absent | Unicode scalar edit distance: 7,225 pairs against full-matrix oracle, empty/Unicode/transposition and long asymmetric cases |
| dgryski/go-rendezvous, 9f7001d12a5f0021fd3283525f888b5814ccee27 | rdv.go, Rendezvous.Lookup | 6,000 characters; complete method and full source file                                 | Validation/hash calls, tie/swap-last removal, and 5,000 oracle lookups during 1,000 mutations                               |

Each first proposal used the existing ChatGPT account, `gpt-6.1-sol` low, without
API-key charges. The proposal received only its contract and exact focused
response, with tools disabled. Hidden acceptance was frozen before each call.
The implementing agent inspected the proposals before execution. Neither code
proposal was edited before acceptance. Source review is not blind or independent.
Both compiled and passed: Rust 1.95.0 and Go 1.27.2 on macOS ARM64. Compiler output
is retained in execution.json; CI repeats the adapted tests on Linux.

input-seal.json preserves the initial freeze. Before any Go model call, the
operator noticed the Go task/oracle had the wrong shift constants (13/7/17).
The captured source uses right-12/left-25/right-27. go-input-seal.json preserves a
separate corrected Go task, oracle and drivers, linking the unchanged initial
Rust freeze. Original task/test/driver files remain for audit, not execution.
Use **check-native.mjs** and **proposal-corrected.mjs**; original check.mjs and
proposal.mjs belong to that initial freeze. This correction predates the first
Go proposal and every Go acceptance execution.

The Go adaptation intentionally repairs the pinned Remove bounds/shrink/index
bug, validates duplicate/empty names and nil hashers, and exposes boolean status.
It retains the pinned score transform with uint64 wrapping. Use New and a stable,
non-reentrant caller hasher. It is single-thread/process-local; no concurrency,
persistence, uniform distribution or production scaling guarantee is claimed.

The Rust adaptation uses one DP row sized to the shorter scalar sequence. Unicode
scalars are not grapheme clusters; strings are not normalized. Very large inputs
can be expensive. It does not compile or certify strsim-rs.

Run offline with compilers already available:

```sh
npm run test:native
# Optional absolute toolchain executables:
SALVAGE_RUSTC=/path/to/rustc SALVAGE_GO=/path/to/go npm run test:native
```

check-native verifies both input seals, first-proposal code bytes and recorded
source review before copying only the adaptations/tests to disposable directories.
Go disables proxy, sum DB, workspace and toolchain downloading. No captured
upstream module is imported or executed. No provider call occurs during tests.

Build exports rust-edit-distance.tar.gz and go-rendezvous-consumer.tar.gz with
code, complete upstream MIT notice, usage, adapted tests and file-hash/provenance
manifest. These are reviewed examples, separate from catalog certification.
