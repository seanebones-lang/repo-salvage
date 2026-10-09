# Unicode scalar edit distance

Adapted from rapidfuzz/strsim-rs at dacc84c0dc61eff0ee0ff66962bcf2e17018ad26.
Include LICENSE with redistribution. No external crates; source is consumer.rs.

```sh
rustc --edition=2021 --crate-type lib consumer.rs
rustc --edition=2021 --test acceptance.rs -o acceptance
./acceptance
```

For an application, copy consumer.rs and LICENSE, declare `mod consumer;`, then
call `consumer::edit_distance("kitten", "sitting")` (3). The function counts Rust
chars (Unicode scalars), not bytes or grapheme clusters; it does not normalize.
Insertion/deletion/substitution cost one. DP memory uses one row sized to the
shorter input. Large inputs can take quadratic time. The three frozen adapted
tests passed; this does not certify the upstream library or production suitability.
