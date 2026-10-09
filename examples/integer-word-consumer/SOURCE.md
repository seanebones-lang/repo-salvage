# Source and adaptation identity

- Repository: `python-humanize/humanize`
- Commit: `785e5dcc0d0308ad0dff3f6cc0faa7085ad0375b`
- Source: [src/humanize/number.py](https://github.com/python-humanize/humanize/blob/785e5dcc0d0308ad0dff3f6cc0faa7085ad0375b/src/humanize/number.py)
- Supplied evidence: complete `intword`, `powers`, `human_powers` and related supporting blocks; containing module omitted.
- Primary reference: `3a216cd3510098163f683047`
- Threshold reference: `cc0dd3d05da4c983be176330`
- Label reference: `503d6dba3784d8c3158c6bc3`
- Exact generated consumer SHA-256: `b413d6bbf05895d6794511589fe958bbc8537754e2bdddb49b467ccb1dd0cf84`
- Notice: Jason Moiron and Contributors' complete MIT license, included in LICENSE and consumer.py.

The function is an adaptation, not a copied complete Humanize module. It replaces
float conversion and locale hooks with exact integer arithmetic and English-only
names. Its tests and requirements were sealed before the first native generation;
the generated code passed without edits. The implementing operator reviewed it
before execution. No upstream source or tests were executed.

The source response used synthetic local routing identities, not a live catalog
listing. Consumer tests do not change the source's untested evidence status.
See [the complete recorded exercise](https://github.com/seanebones-lang/repo-salvage/tree/main/examples/scoped-consumer-evaluation)
for the input archive, native result, separate review/execution records and seals.
