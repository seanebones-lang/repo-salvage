# Lossless bounded prose splitting

A standalone Python 3.9+ adaptation discovered through Repo Salvage's native MCP
tools from an ordinary request. It uses only `re` and `typing`. The original
application module was neither imported nor executed.

```python
from prose import split_prose

text = "First paragraph.\n\n" + "x" * 100
chunks = split_prose(text, 32)
assert "".join(chunks) == text
assert all(0 < len(chunk) <= 32 for chunk in chunks)
```

The adaptation prefers paragraph boundaries, then line, sentence and whitespace
boundaries. Oversized spans recurse; terminal unbroken text is sliced. Original
separators stay in the chunks, so joining requires **no added separator**. Python
string length counts code points, not bytes, tokens or user-perceived graphemes.
An empty string returns `[]`; non-integer, boolean, zero and negative limits raise
`ValueError`.

Unlike its upstream starting point, the adaptation retains whitespace, clears
flushed buffers, validates limits and always bounds unbroken tokens. The original
splitter can discard spaces/delimiters, duplicate buffered text and exceed its
configured maximum. This example repairs those behaviors without changing the
upstream repository or its catalog brief.

Run from the repository root:

```sh
npm run test:prose
```

The check copies the reviewed code, original notice and pre-run tests into a clean
temporary directory and runs Python in isolated mode without application imports,
credentials or network access requests. Eight operator-owned tests cover boundary
preference, exact/short limits, whitespace, unbroken words, Unicode, invalid limits
and 1,000 deterministic randomized round trips. The exact generated code passed
without post-generation edits. Tests were sealed before generation, outside the
model's workspace; no model call is made by this command or CI.

This is evidence for these consumer behaviors. Load, security, grapheme-aware
splitting and integration with a particular ingestion pipeline were not tested.
It grants no independent-test badge to the catalog's upstream part. See
[SOURCE.md](SOURCE.md) and the [recorded adaptation](../discovery-evaluation/adaptation-results.json).
