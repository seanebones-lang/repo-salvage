# Exact English integer formatter

A standard-library-only Python 3.9+ adaptation generated from the scoped supporting
source in the [Humanize diagnostic](../scoped-context-evaluation/README.md).
Its first generated code passed the frozen acceptance tests without operator edits.

```python
from consumer import format_integer

assert format_integer(1234567, 3) == '1.235 million'
assert format_integer(999950) == '1.0 million'
assert format_integer(-1050) == '-1.0 thousand'  # exact half-even rounding
```

`format_integer(value, places=1)` accepts integers excluding booleans. Other value
types raise `TypeError`. Precision must be an integer excluding booleans between
0 and 6; wrong types raise `TypeError`, and out-of-range values raise `ValueError`.
Integers below 1000 in absolute magnitude retain their exact text. Larger values
use fixed decimal digits and the supplied English magnitude names, from thousand
through decillion and then googol. A rounded result carries into the next supplied
magnitude, including that large gap. Googol remains the largest name. Negative
values retain their leading minus sign.

The adaptation uses integer arithmetic instead of floating-point conversion, and
the acceptance tests cover values through `10**200`. It deliberately omits Humanize's
float/string coercion, arbitrary format strings, translation and locale state.
This is a different API with a narrower contract, not a drop-in Humanize module.
Very large inputs beyond the exercised range and hostile integer subclasses are
outside these checks; Python's own integer/string resource limits still apply.

After extracting the standalone bundle, run:

```sh
python3 -I -m unittest discover -s . -p test_consumer.py -v
```

Within the application repository, run `npm run test:integer`. The driver verifies the
pre-generation input archive, generated-code hash and separate review/execution
records, copies only code, tests and the complete original notice into a temporary
directory, and runs Python in isolated mode without forwarded credentials or
application imports. Nine acceptance tests include half-even ties, rounding carries,
negative values, type/precision errors, all named magnitudes and 1,500 deterministic
comparisons with a high-precision Decimal reference.

Source: [Humanize number.py at its pinned commit](https://github.com/python-humanize/humanize/blob/785e5dcc0d0308ad0dff3f6cc0faa7085ad0375b/src/humanize/number.py),
`intword` and its supplied magnitude tables. Jason Moiron and Contributors' complete
MIT notice is retained in [LICENSE](LICENSE) and the exact generated module.
See the [adaptation record](https://github.com/seanebones-lang/repo-salvage/tree/main/examples/scoped-consumer-evaluation) for scope and
provenance. The upstream module was not imported or executed, and these consumer
checks do not certify the upstream part or change its catalog test status.
