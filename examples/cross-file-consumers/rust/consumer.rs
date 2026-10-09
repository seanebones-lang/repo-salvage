// consumer.rs — Rust 2021
// Adapted from dtolnay/itoa at commit
// 1577ed901354d0d7448ac162328f9dbf5183124c.
// Selected license: MIT (upstream offers MIT OR Apache-2.0).
//
// Permission is hereby granted, free of charge, to any
// person obtaining a copy of this software and associated
// documentation files (the "Software"), to deal in the
// Software without restriction, including without
// limitation the rights to use, copy, modify, merge,
// publish, distribute, sublicense, and/or sell copies of
// the Software, and to permit persons to whom the Software
// is furnished to do so, subject to the following
// conditions:
//
// The above copyright notice and this permission notice
// shall be included in all copies or substantial portions
// of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
// ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
// TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
// PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
// SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
// CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
// OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
// IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
// DEALINGS IN THE SOFTWARE.

pub fn split_decimal_1e16(n: u128) -> (u128, u64) {
    const D: u128 = 10_000_000_000_000_000;
    if n < D {
        return (0, n as u64);
    }

    // CHOOSE_MULTIPLIER from Granlund & Montgomery,
    // with N=128, prec=128, and d=1E16.
    const M_HIGH: u128 = 76624777043294442917917351357515459181;
    const SH_POST: u8 = 51;

    let quot = mulhi(n, M_HIGH) >> SH_POST;
    let rem = n - quot * D;
    (quot, rem as u64)
}

// Return the upper 128 bits of the unsigned 256-bit product.
#[inline]
fn mulhi(x: u128, y: u128) -> u128 {
    let x_lo = x as u64;
    let x_hi = (x >> 64) as u64;
    let y_lo = y as u64;
    let y_hi = (y >> 64) as u64;

    let carry = (u128::from(x_lo) * u128::from(y_lo)) >> 64;
    let m = u128::from(x_lo) * u128::from(y_hi) + carry;
    let high1 = m >> 64;

    let m_lo = m as u64;
    let high2 = (u128::from(x_hi) * u128::from(y_lo) + u128::from(m_lo)) >> 64;

    u128::from(x_hi) * u128::from(y_hi) + high1 + high2
}
