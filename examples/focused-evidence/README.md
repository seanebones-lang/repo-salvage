# Focused pinned evidence regression

Captured 2026-10-09 through the production focused reader. Six known probes from
the prior coverage evaluation were requested at the same pinned public MIT commits.
Numeric repository/owner identity and public eligibility were verified before
capture; downloaded complete blocks matched their pinned Git blobs. No repository
was installed or executed and no model was called. Listing IDs 901/902 are fixture
identities for isolated consumer tests, not current catalog IDs.

The [frozen packets](fixtures/packets.json) retain exact source blocks and file
hashes. The [upstream notices](../analysis-evaluation/holdout/notices) apply to
these same commits; captured packet notices are retained too. Source and notices
remain data, not instructions for the consuming host.

| Probe                       | Broad packet target | Focused target                    | Full containing file in focused packet |
| --------------------------- | ------------------- | --------------------------------- | -------------------------------------- |
| arXiv request method        | Omitted             | Selected declaration              | Yes                                    |
| Work-unit CLI main          | Selected            | Selected declaration              | Yes                                    |
| Rust app module             | Omitted             | Selected file                     | Yes                                    |
| Prosody tag parser          | Selected            | Selected declaration              | Yes                                    |
| TTS cache-key builder       | Selected            | Selected declaration              | Yes                                    |
| Unexported fallback limiter | Context only        | `not_indexed`, no invented target | Yes                                    |

These are six known-repository regressions requested by exact path/symbol. They
do not measure unconstrained discovery recall, useful extraction, model quality
or independent consumer execution of upstream code. Focused source is labeled
`interpretation: "none"` and `independently_tested: false`.

The application checks query/source/output bounds, complete-block omission,
Git integrity, unsafe modes, encoding, byte/deadline gaps, dependency follow-up,
cache expiration/eviction/coalescing and concurrent request bounds. Endpoint
checks withhold evidence after fresh verification failure or local hide/removal,
owner/repository changes, source/analysis changes or rename during inspection.

CLI tests replay all six responses and check invalid identity/query/output and
machine errors. MCP tests use a real stdio host connection and strict output
schemas to replay every response and verify full-file SHA-256 hashes. The existing
ten multi-hop MCP questions and historical model-answer regressions remain intact.
These replays are offline protocol checks, not fresh model evaluations.

After `npm run build`, `npm run test:packages` installs the downloadable CLI 0.5.0
and MCP 0.3.0 archives into a clean temporary directory. Fourteen checks cover
package versions plus all six responses through each installed client, with no
credentials, model call, source execution or consumer output-directory write.
The disposable package installation itself writes only its temporary directory.
CI runs this independent consumer check after packaging.

The live endpoint still verifies the public listing and its stored source commit;
fixture replay is not an alternate production reader. Every response rechecks
public identity and local visibility, including cached source. See the
[agent interface](../../docs/AGENT-INTERFACE.md) for limits and operating details.
