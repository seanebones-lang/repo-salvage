After discovery and source inspection, produce a standalone, standard-library-only
Python adaptation. Return its complete source in an additional JSON `code` field;
keep the `answer` and `finding` fields. Do not execute it or write files yourself.

Expose `split_prose(text: str, max_chars: int) -> list[str]`. Every output chunk
must have at most `max_chars` characters, and joining the output chunks without
a separator must reproduce the original input exactly, including whitespace.
Prefer paragraph boundaries when one fits within the limit. Handle oversized
paragraphs and unbroken words. Empty input returns an empty list. Reject
non-integer, boolean, zero or negative limits with ValueError. Remove application
configuration, models and optional-library imports; correct any source defects
you identify. Explain intentional changes in `finding` and retain upstream
repository/commit attribution in a source comment. Read the relevant license
notice through MCP before adapting. This response is proposed code, not a claim
of independent tests passing; operator-owned consumer checks run separately.
