# Count-bounded LRU cache consumer

A standard-library-only Python 3.9+ mutable mapping adapted by a fresh native MCP
agent from pinned MIT source. The exact generated code passed the acceptance tests
without operator edits.

```python
from consumer import LRUCache

cache = LRUCache(2)
cache['a'], cache['b'] = 1, 2
assert cache['a'] == 1  # promote a
cache['c'] = 3         # evict b
assert 'b' not in cache
```

Successful reads and replacements promote recency; membership does not. `get`,
`pop`, `setdefault`, `update` and mapping views use `MutableMapping` behavior.
Reading values through those operations counts as a read. Key iteration follows
insertion order. `popitem()` removes the least recently used entry and raises
`KeyError` when empty. `clear()` resets both value and recency state. `maxsize`
and `currsize` are read-only properties.

Capacities must be nonnegative integers, excluding booleans; invalid capacities
raise `ValueError`. Zero capacity is allowed but insertion raises `ValueError`.
Keys must be hashable. This adaptation omits custom value sizing, decorators,
expiry and persistence, and is intended for one thread.

Run `npm run test:cache` from the application root. The driver verifies the
pre-generation test seal and exact generated code hash, copies only code, tests
and the original notice into a temporary directory, and runs Python in isolated
mode with no application imports or forwarded credentials. Ten tests cover
recency, replacement, membership, mapping operations, deletion, clearing, missing
keys, capacity validation and 2,000 seeded operations against an `OrderedDict`
reference model. The upstream application module was never executed.

Source: [tkem/cachetools at the pinned commit](https://github.com/tkem/cachetools/blob/9976f1a8076631560f49c5b0dfda7e4d00ee0a4a/src/cachetools/__init__.py),
`Cache` and `LRUCache`. Thomas Kemmer's complete MIT notice is retained in
[LICENSE](LICENSE) and in the generated source. See the
[full-chain evaluation](../full-chain-evaluation/README.md) for the generated-brief
miss and the agent's recovery. These consumer tests do not certify the catalog's
upstream part or establish concurrency, security or integration results.
