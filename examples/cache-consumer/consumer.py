# Adapted from tkem/cachetools, src/cachetools/__init__.py (Cache and LRUCache).
# Pinned upstream commit: 9976f1a8076631560f49c5b0dfda7e4d00ee0a4a
# https://github.com/tkem/cachetools/blob/9976f1a8076631560f49c5b0dfda7e4d00ee0a4a/src/cachetools/__init__.py
#
# The MIT License (MIT)
#
# Copyright (c) 2014-2026 Thomas Kemmer
#
# Permission is hereby granted, free of charge, to any person obtaining a copy of
# this software and associated documentation files (the "Software"), to deal in
# the Software without restriction, including without limitation the rights to
# use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
# the Software, and to permit persons to whom the Software is furnished to do so,
# subject to the following conditions:
#
# The above copyright notice and this permission notice shall be included in all
# copies or substantial portions of the Software.
#
# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
# IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
# FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
# COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
# IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
# CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

"""A single-thread, item-count-bounded mutable mapping with LRU eviction."""

from collections import OrderedDict
from collections.abc import MutableMapping

__all__ = ["LRUCache"]


class LRUCache(MutableMapping):
    """Promote successful reads and writes; membership does not promote.

    Key iteration follows insertion order. Value lookups through mapping
    operations and views count as reads. Capacity properties are read-only.
    """

    def __init__(self, maxsize):
        if isinstance(maxsize, bool) or not isinstance(maxsize, int):
            raise ValueError("maxsize must be a nonnegative integer")
        if maxsize < 0:
            raise ValueError("maxsize must be a nonnegative integer")
        self.__maxsize = int(maxsize)
        self.__data = {}
        self.__order = OrderedDict()

    @property
    def maxsize(self):
        """Maximum number of entries."""
        return self.__maxsize

    @property
    def currsize(self):
        """Current number of entries."""
        return len(self.__data)

    def __getitem__(self, key):
        value = self.__data[key]
        self.__order.move_to_end(key)
        return value

    def __setitem__(self, key, value):
        if self.__maxsize == 0:
            raise ValueError("cannot insert into a zero-capacity cache")
        if key in self.__data:
            self.__data[key] = value
            self.__order.move_to_end(key)
            return
        if len(self.__data) >= self.__maxsize:
            self.popitem()
        self.__data[key] = value
        self.__order[key] = None

    def __delitem__(self, key):
        del self.__data[key]
        del self.__order[key]

    def __contains__(self, key):
        return key in self.__data

    def __iter__(self):
        return iter(self.__data)

    def __len__(self):
        return len(self.__data)

    def clear(self):
        """Remove every entry."""
        self.__data.clear()
        self.__order.clear()

    def popitem(self):
        """Remove and return the least recently used (key, value) pair.

        Raise KeyError when empty.
        """
        if not self.__order:
            raise KeyError("LRUCache is empty")
        key, _ = self.__order.popitem(last=False)
        return key, self.__data.pop(key)

    def __repr__(self):
        return (
            f"{type(self).__name__}({self.__data!r}, "
            f"maxsize={self.maxsize!r}, currsize={self.currsize!r})"
        )
