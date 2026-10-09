// Adapted from rapidfuzz/strsim-rs, src/lib.rs (MIT), pinned commit
// dacc84c0dc61eff0ee0ff66962bcf2e17018ad26.
// Copyright (c) 2015 Danny Guo
// Copyright (c) 2016 Titus Wormer <tituswormer@gmail.com>
// Copyright (c) 2018 Akash Kurdekar
// The upstream LICENSE, containing the full MIT permission notice and
// disclaimer, must accompany redistribution.

#![forbid(unsafe_code)]

/// Returns unit-cost Levenshtein distance over Unicode scalar values.
/// No normalization or grapheme segmentation is performed.
pub fn edit_distance(a: &str, b: &str) -> usize {
    let a_len = a.chars().count();
    let b_len = b.chars().count();
    let (longer, shorter, short_len) = if a_len >= b_len {
        (a, b, b_len)
    } else {
        (b, a, a_len)
    };

    // Each entry holds the previous row until it is overwritten.
    let mut cache: Vec<usize> = (1..=short_len).collect();
    let mut result = short_len;

    for (i, long_char) in longer.chars().enumerate() {
        result = i + 1;
        let mut diagonal = i;

        for (j, short_char) in shorter.chars().enumerate() {
            let above = cache[j];
            let substitution = diagonal + usize::from(long_char != short_char);
            result = (result + 1).min(substitution.min(above + 1));
            diagonal = above;
            cache[j] = result;
        }
    }

    result
}
