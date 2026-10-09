"""Pre-generation acceptance contract for a deliberately narrower integer formatter."""
import decimal
import random
import unittest
from consumer import format_integer

LABELS = ('thousand', 'million', 'billion', 'trillion', 'quadrillion', 'quintillion', 'sextillion', 'septillion', 'octillion', 'nonillion', 'decillion', 'googol')
EXPONENTS = (3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 100)


def reference(value, places):
    if abs(value) < 1000:
        return str(value)
    with decimal.localcontext() as ctx:
        ctx.prec = 300
        magnitude = decimal.Decimal(abs(value))
        chosen = max(i for i, e in enumerate(EXPONENTS) if magnitude >= decimal.Decimal(10) ** e)
        quantum = decimal.Decimal(1).scaleb(-places)
        rounded = (magnitude / (decimal.Decimal(10) ** EXPONENTS[chosen])).quantize(quantum, rounding=decimal.ROUND_HALF_EVEN)
        if chosen + 1 < len(EXPONENTS) and rounded >= decimal.Decimal(10) ** (EXPONENTS[chosen + 1] - EXPONENTS[chosen]):
            chosen += 1
            rounded = decimal.Decimal(1).quantize(quantum)
        return ('-' if value < 0 else '') + format(rounded, f'.{places}f') + ' ' + LABELS[chosen]


class IntegerWordTests(unittest.TestCase):
    def test_small_integers(self):
        for value in (0, 1, -1, 999, -999):
            self.assertEqual(format_integer(value), str(value))
            self.assertEqual(format_integer(value, 6), str(value))

    def test_named_magnitudes(self):
        for exponent, label in zip(EXPONENTS, LABELS):
            self.assertEqual(format_integer(10 ** exponent), '1.0 ' + label)
            self.assertEqual(format_integer(-10 ** exponent, 0), '-1 ' + label)

    def test_fixed_precision(self):
        self.assertEqual(format_integer(1234567, 3), '1.235 million')
        self.assertEqual(format_integer(1234567, 6), '1.234567 million')
        self.assertEqual(format_integer(1000, 0), '1 thousand')

    def test_exact_half_even(self):
        for value, expected in ((1050, '1.0 thousand'), (1150, '1.2 thousand'), (1250, '1.2 thousand'), (1350, '1.4 thousand')):
            self.assertEqual(format_integer(value), expected)
            self.assertEqual(format_integer(-value), '-' + expected)

    def test_rounding_carry(self):
        for exponent in EXPONENTS[1:]:
            value = 10 ** exponent - 1
            for places in (0, 1, 6):
                self.assertEqual(format_integer(value, places), reference(value, places))
                self.assertEqual(format_integer(-value, places), reference(-value, places))
        self.assertEqual(format_integer(999950), '1.0 million')

    def test_large_exact_values(self):
        for value in (10 ** 33 - 1, 10 ** 100 - 1, 10 ** 100, 10 ** 120 + 12345, 10 ** 200):
            self.assertEqual(format_integer(value, 6), reference(value, 6))

    def test_value_validation(self):
        for value in (True, False, 1.5, '1000', None, decimal.Decimal(1000)):
            with self.assertRaises(TypeError):
                format_integer(value)

    def test_precision_validation(self):
        for places in (True, False, 1.0, '1', None):
            with self.assertRaises(TypeError):
                format_integer(1000, places)
        for places in (-1, 7, 100):
            with self.assertRaises(ValueError):
                format_integer(1000, places)

    def test_seeded_reference_comparison(self):
        rng = random.Random(20261009)
        for _ in range(1500):
            exponent = rng.choice(EXPONENTS)
            value = rng.choice((-1, 1)) * rng.randrange(max(1, 10 ** exponent - 10000), 10 ** exponent + 10000)
            places = rng.randrange(7)
            self.assertEqual(format_integer(value, places), reference(value, places))


if __name__ == '__main__':
    unittest.main()
