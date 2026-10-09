# Direct native file context probes

These are authored boundary probes for the current source engine. They demonstrate
Go same-package peers, rejected different-package files and conventional Rust
module files through focused HTTP, CLI and local stdio MCP. They are not pinned
upstream programs, model evaluations, compilation proofs or extraction benchmarks.
Target snippets stay parser input data and are never imported or executed.

Run the regression with `npx vitest run tests/native-file-context.test.ts`, CLI
checks with `npm run test:cli`, MCP checks with `npm run test:mcp`, and freshly
installed archives after build with `npm run test:packages`. The latter verifies
both file-context cases through CLI and MCP in an independent temporary directory.
No API credential or provider request is needed.

`file_contexts` is optional and distinct from same-file supporting units. Its
`supplied` links refer only to complete file bodies. Missing, rejected, omitted or
budget-limited context stays visible; no package build configuration, crate
ownership, initialization, imported binding, receiver or trait is resolved. Several
Go peers may be mutually exclusive build variants. See the
[agent contract](../../docs/AGENT-INTERFACE.md#direct-go-package-and-rust-module-files).

A separate byte-sealed `pinned.json` retains three actual read-only requests:
Witness `482ce52011d55c4991cd7dc73fa103c9527c43ab` under its already approved MPL-2.0
license; cespare/xxhash `ab37246c889f9db16b606fda1c232d659df9271d` under MIT; and
dtolnay/itoa `1577ed901354d0d7448ac162328f9dbf5183124c` with its MIT license option.
Every captured source read passed Git blob verification. xxhash supplies three
same-package build variants and leaves a fourth unread. itoa supplies its complete
`u128_ext.rs` module. Witness preserves three notice files, reports the one read
module as too large for the packet, and leaves three modules unread. Those gaps
are deliberate evidence, not successes hidden by the probe.

`tests/native-file-context-pinned.test.mjs` verifies the seal, captured body hashes
and exact current-engine offline replay. Freshly installed CLI/MCP checks replay
all three pinned responses as well as the two authored cases. xxhash and itoa use
synthetic listing IDs solely for offline routing; no catalog entries were added.
The target repositories were not compiled, installed or executed. `capture.mjs`
is the one-time read-only capture driver and refuses to replace retained files.
