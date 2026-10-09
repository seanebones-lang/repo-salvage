"""Consumer contracts and frozen upstream vectors; no application imports."""
import json
import math
from pathlib import Path
import subprocess
import sys
import unittest
from unittest.mock import patch

from assignment import assign_variant

ROOT = Path(__file__).resolve().parent
VECTORS = json.loads((ROOT / "acceptance-vectors.json").read_text(encoding="utf-8"))


class AssignmentTests(unittest.TestCase):
    def cli(self, experiment, user, split):
        return subprocess.run(
            [sys.executable, "-I", str(ROOT / "assignment.py"), experiment, user, "--", split],
            cwd=ROOT, capture_output=True, text=True, encoding="utf-8", timeout=10,
        )

    def test_frozen_upstream_assignments(self):
        for row in VECTORS:
            with self.subTest(row=row):
                self.assertEqual(assign_variant(row["experiment_id"], row["user_id"], row["traffic_split"]), row["variant"])

    def test_strict_threshold_from_frozen_bucket(self):
        # Frozen normalized bucket for checkout-v1:u-001 at the recorded commit.
        threshold = 0.5069997449521988
        self.assertEqual(assign_variant("checkout-v1", "u-001", threshold), "A")
        self.assertEqual(assign_variant("checkout-v1", "u-001", math.nextafter(threshold, 1)), "B")
        self.assertEqual(assign_variant("checkout-v1", "u-001", math.nextafter(threshold, 0)), "A")

    def test_extremes_are_absolute(self):
        for row in VECTORS:
            self.assertEqual(assign_variant(row["experiment_id"], row["user_id"], 0), "A")
            self.assertEqual(assign_variant(row["experiment_id"], row["user_id"], 1), "B")

    def test_full_split_survives_float_rounding_edge(self):
        # The upstream float normalization can round a near-maximum digest to 1.
        with patch("assignment.hashlib.md5") as digest:
            digest.return_value.hexdigest.return_value = "f" * 32
            self.assertEqual(assign_variant("e", "u", 1), "B")
            self.assertEqual(assign_variant("e", "u", 0), "A")

    def test_repeatability_after_other_assignments(self):
        first = assign_variant("checkout-v2", "u-001", 0.5)
        for row in reversed(VECTORS):
            assign_variant(row["experiment_id"], row["user_id"], row["traffic_split"])
        self.assertEqual(assign_variant("checkout-v2", "u-001", 0.5), first)

    def test_fresh_interpreters_match_fixed_vectors(self):
        for row in VECTORS:
            result = self.cli(row["experiment_id"], row["user_id"], str(row["traffic_split"]))
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(result.stdout, row["variant"] + "\n")

    def test_identifier_delimiter_behavior_is_documented_and_preserved(self):
        self.assertEqual(assign_variant("exp:colon", "user", 0.5), "B")
        self.assertEqual(assign_variant("exp", "colon:user", 0.5), "B")

    def test_invalid_numeric_splits(self):
        for split in (-0.1, 1.1, float("nan"), float("inf"), -float("inf"), 10**1000):
            with self.subTest(split=split), self.assertRaises(ValueError):
                assign_variant("e", "u", split)

    def test_non_numeric_and_boolean_splits(self):
        for split in (True, False, "0.5", None, complex(0.5), object()):
            with self.subTest(split=split), self.assertRaises(TypeError):
                assign_variant("e", "u", split)

    def test_identifiers_do_not_coerce_unstable_objects(self):
        for experiment, user in [(1, "u"), ("e", None), (object(), "u")]:
            with self.subTest(experiment=experiment, user=user), self.assertRaises(TypeError):
                assign_variant(experiment, user, 0.5)

    def test_cli_rejects_invalid_splits_without_assignment_output(self):
        for split in ("-0.1", "1.1", "nan", "inf", "-inf", "garbage"):
            result = self.cli("e", "u", split)
            self.assertEqual(result.returncode, 2)
            self.assertEqual(result.stdout, "")
            self.assertTrue(result.stderr)

    def test_cli_supports_both_extremes(self):
        for split, expected in [("0", "A\n"), ("1", "B\n")]:
            result = self.cli("e", "u", split)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(result.stdout, expected)


if __name__ == "__main__":
    unittest.main()
