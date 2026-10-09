"""Lossless, paragraph-first prose chunking (Python 3.9+)."""

# Adapted from seanebones-lang/personal-RAG,
# src/ingest/chunking/strategies.py, commit:
# 7d979a2cecdc3e588a7d3e8b65cd2ef7664fec66
# Intentional changes: retain separators and whitespace, correct overflow
# buffering, validate limits, and always slice oversized terminal spans.

# MIT License
#
# Copyright (c) 2026 Sean McDonnell
#
# Permission is hereby granted, free of charge, to any person obtaining a copy
# of this software and associated documentation files (the "Software"), to deal
# in the Software without restriction, including without limitation the rights
# to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
# copies of the Software, and to permit persons to whom the Software is
# furnished to do so, subject to the following conditions:
#
# The above copyright notice and this permission notice shall be included in all
# copies or substantial portions of the Software.
#
# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
# IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
# FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
# AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
# LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
# OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
# SOFTWARE.

import re
from typing import Iterator


_SEPARATORS = (
    re.compile(r"(?:\r\n|\r|\n)[^\S\r\n]*(?:\r\n|\r|\n)"),
    re.compile(r"\r\n|\r|\n"),
    re.compile(r"(?<=[.!?])\s+"),
    re.compile(r"\s+"),
)


def _retained_parts(text: str, separator: re.Pattern) -> Iterator[str]:
    """Partition text, attaching each matched separator to its left span."""
    start = 0
    for match in separator.finditer(text):
        end = match.end()
        yield text[start:end]
        start = end
    if start < len(text):
        yield text[start:]


def _split_recursive(text: str, max_chars: int, level: int) -> Iterator[str]:
    if not text:
        return
    if len(text) <= max_chars:
        yield text
        return
    if level == len(_SEPARATORS):
        for start in range(0, len(text), max_chars):
            yield text[start:start + max_chars]
        return

    current: list[str] = []
    current_len = 0
    for part in _retained_parts(text, _SEPARATORS[level]):
        part_len = len(part)
        if part_len > max_chars:
            if current:
                yield ''.join(current)
                current = []
                current_len = 0
            yield from _split_recursive(part, max_chars, level + 1)
        else:
            if current_len + part_len > max_chars:
                yield ''.join(current)
                current = []
                current_len = 0
            current.append(part)
            current_len += part_len
    if current:
        yield ''.join(current)


def split_prose(text: str, max_chars: int) -> list[str]:
    """Return bounded chunks whose concatenation exactly equals text.

    Prefer paragraph boundaries, then line, sentence and whitespace boundaries.
    Oversized spans recurse through those choices; unbroken spans are sliced.
    Character counts follow Python len(str), not encoded bytes or graphemes.
    """
    if isinstance(max_chars, bool) or not isinstance(max_chars, int):
        raise ValueError('max_chars must be a positive integer')
    if max_chars <= 0:
        raise ValueError('max_chars must be a positive integer')
    return list(_split_recursive(text, max_chars, 0))
