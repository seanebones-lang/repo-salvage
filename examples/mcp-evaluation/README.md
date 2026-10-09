# Frozen MCP evaluation

Ten independent, read-only, multi-hop questions cover seven approved public pilot
repositories. `evaluation.xml` is the model evaluation input; `answers.json`
records expected answers, exact search/inspection calls and evidence extracts.
The expected answers describe the frozen catalog, including generated guidance;
they are not independent certification of the source components.

The snapshot's revision is
`984de759101f3a54f44fe135206151eb1c882c0270747f0b98d8f7c1614a6a48`.
`fixtures/catalog.json` contains captured public search records and inspection
manifests, with provenance, original licenses and uncertainty retained. It has no
credential or source-file bytes. Live catalogs can change; these questions are
explicitly scoped to this revision.

From the repository root:

```sh
npm ci
npm run test:mcp
node examples/mcp-evaluation/query.mjs repo_salvage_search_parts '{"q":"deadbolt","limit":10}'
```

The query helper launches the actual stdio adapter with the official SDK client
against a local snapshot replay. It permits search and inspection only. The replay
uses simple AND matching over captured row JSON and retains captured ordering;
it does not reproduce production relevance/sort behavior or fresh GitHub checks.
It is a test fixture, not an alternative API implementation.

The ten evidence-replay checks verify all 31 recorded calls against actual MCP
outputs. They detect drift in the recorded evidence; they do not score an LLM's
ability to discover the answers. A separate host/model trial can use the XML and
compare exact answers. No model invocation or charge is part of this harness.
