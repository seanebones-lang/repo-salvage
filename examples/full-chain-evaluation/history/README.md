# Historical trusted analysis engine

This archive preserves the repository-owned application modules and isolated AST
parser from merged commit `d494b9037454d40f4a9252c6619f27d3a4a22c22`. Its sealed
source-index, source-selection and summarizer bytes match the original full-chain
input seal. No upstream target code is executable through this archive.

The original corpus, controls, operator hosts, requests, results and seals remain
unchanged. `replay.mjs` verifies those records against these original engine bytes,
then reconstructs the exact request and verified summary offline. The current
trusted loader uses a fixed historical profile and parses target source as data
with the archived isolated parser. This removes a dependency on the current
production source bytes without rewriting the original miss or model call.

`tests/full-chain-evaluation.test.mjs` uses this replay entry point. The original
operator hosts still require their original production engine and package hashes;
reproducing that environment requires the recorded commit. No fresh model calls
or new certification result are implied by offline replay.
