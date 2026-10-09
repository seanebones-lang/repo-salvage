# Repeatable A/B assignment consumer

A Python 3.9+ standard-library adaptation discovered by a separate Codex CLI host
through the installed Repo Salvage MCP package. No original application import,
package installation or network request is needed to use this consumer.

```sh
python3 -m unittest -v test_assignment.py
python3 assignment.py checkout-v2 u-001 0.5
```

The CLI prints `A` or `B`; the split is the fraction assigned to B. Import
`assign_variant(experiment_id, user_id, traffic_split)` from `assignment.py` in
your own project. Use stable string identifiers and a finite real split in [0,1].
Invalid inputs fail explicitly. This consumer has no experiment registry, tracker,
shared state or measurement logic.

Twelve behavior checks cover frozen upstream assignments, precise threshold
behavior, exact endpoints, invalid inputs and fresh Python interpreter processes.
They verify this included adaptation. They do not certify the upstream application,
distribution quality, statistical significance, concurrent rollout or security.

The upstream `experiment_id:user_id` formatting is preserved: identifiers
containing colons can collide. Decide whether that convention suits your identifier
namespace before using it. MD5 is a non-security bucketing convention; this is not
an authentication or cryptographic component.

The host-produced extraction passed six tests. Subsequent review added stable
string input validation and fixed the split=1 floating-point rounding edge.
For interior splits, the observed upstream bucket/comparison rule is preserved.
See [SOURCE.md](SOURCE.md) for exact commits, hashes, dependency omissions and all
intentional changes. Keep [the upstream MIT notice](notices/LICENSE) with copies.
