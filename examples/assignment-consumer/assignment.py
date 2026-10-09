"""Standalone assignment adapted from BTC Predictor; see SOURCE.md and notices/LICENSE."""

import argparse
import hashlib
import math
from numbers import Real


def assign_variant(experiment_id, user_id, traffic_split):
    """Return A or B; traffic_split is the fraction assigned to B.

    Identifiers retain upstream f-string formatting, including colon ambiguity.
    The same identifiers and split produce the same result across processes.
    """
    if not isinstance(experiment_id, str) or not isinstance(user_id, str):
        raise TypeError("experiment_id and user_id must be strings")
    if isinstance(traffic_split, bool) or not isinstance(traffic_split, Real):
        raise TypeError("traffic_split must be a real number (not bool)")
    if not 0 <= traffic_split <= 1 or not math.isfinite(traffic_split):
        raise ValueError("traffic_split must be finite and between 0 and 1")
    if traffic_split == 0:
        return "A"
    if traffic_split == 1:
        return "B"
    hash_input = f"{experiment_id}:{user_id}".encode()
    hash_val = int(hashlib.md5(hash_input, usedforsecurity=False).hexdigest(), 16)
    return "B" if (hash_val / 2**128) < traffic_split else "A"


def main():
    parser = argparse.ArgumentParser(description="Repeatable A/B assignment")
    parser.add_argument("experiment_id")
    parser.add_argument("user_id")
    parser.add_argument("traffic_split", type=float, help="fraction assigned to B, 0 to 1")
    args = parser.parse_args()
    try:
        variant = assign_variant(args.experiment_id, args.user_id, args.traffic_split)
    except (TypeError, ValueError) as exc:
        parser.error(str(exc))
    print(variant)


if __name__ == "__main__":
    main()
