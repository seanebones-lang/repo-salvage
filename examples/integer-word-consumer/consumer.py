"""English integer formatting with exact round-half-even arithmetic.

Copyright (c) 2010-2020 Jason Moiron and Contributors

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
"""

from bisect import bisect_right

__all__ = ["format_integer"]

_POWERS = tuple(10 ** exponent for exponent in
                (3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 100))
_NAMES = (
    "thousand", "million", "billion", "trillion", "quadrillion",
    "quintillion", "sextillion", "septillion", "octillion",
    "nonillion", "decillion", "googol",
)


def _round_half_even(numerator: int, denominator: int) -> int:
    quotient, remainder = divmod(numerator, denominator)
    twice_remainder = remainder * 2
    if twice_remainder > denominator or (
        twice_remainder == denominator and quotient % 2 == 1
    ):
        quotient += 1
    return quotient


def format_integer(value: int, places: int = 1) -> str:
    """Format an integer using English magnitudes and 0–6 decimal places.

    Integers with absolute magnitude below 1000 retain their exact text.
    Larger integers use exact half-even rounding and carry to the next
    supplied magnitude when necessary. Googol is the largest named unit.
    """
    if isinstance(value, bool) or not isinstance(value, int):
        raise TypeError("value must be an int, excluding bool")
    if isinstance(places, bool) or not isinstance(places, int):
        raise TypeError("places must be an int, excluding bool")
    if not 0 <= places <= 6:
        raise ValueError("places must be between 0 and 6 inclusive")

    magnitude = abs(value)
    if magnitude < 1000:
        return str(value)

    scale = 10 ** places
    index = bisect_right(_POWERS, magnitude) - 1
    while True:
        power = _POWERS[index]
        rounded = _round_half_even(magnitude * scale, power)
        if index + 1 < len(_POWERS) and (
            rounded * power >= _POWERS[index + 1] * scale
        ):
            index += 1
            continue
        break

    whole, fraction = divmod(rounded, scale)
    number = str(whole)
    if places:
        number += "." + str(fraction).zfill(places)
    prefix = "-" if value < 0 else ""
    return prefix + number + " " + _NAMES[index]
