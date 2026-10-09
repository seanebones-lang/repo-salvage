"""Operator-owned checks, frozen before the adaptation model run."""
import random
import unittest

from prose import split_prose


class ProseConsumerTests(unittest.TestCase):
    def check_roundtrip(self, text, limit):
        chunks = split_prose(text, limit)
        self.assertIsInstance(chunks, list)
        self.assertEqual("".join(chunks), text)
        self.assertTrue(all(isinstance(c, str) and 0 < len(c) <= limit for c in chunks))
        return chunks

    def test_empty_and_whitespace(self):
        self.assertEqual(split_prose("", 5), [])
        self.check_roundtrip(" \t\n\n   ", 2)

    def test_paragraph_preference(self):
        text = "First para\n\n" + "x" * 25
        chunks = self.check_roundtrip(text, 14)
        self.assertEqual(chunks[0], "First para\n\n")

    def test_oversized_unbroken_token(self):
        self.check_roundtrip("a" * 103, 7)

    def test_spaces_delimiters_and_no_duplicate_prefix(self):
        self.check_roundtrip("lead abcdefghijklmnop next. words\n\nend", 5)
        self.check_roundtrip(" one  two\tthree. four \r\n\r\n five ", 9)

    def test_unicode_and_single_character_limit(self):
        text = "🧠 café e\u0301 中文\n\n🛠️ finish"
        self.check_roundtrip(text, 1)
        self.check_roundtrip(text, 6)

    def test_exact_limit_and_short_input(self):
        self.assertEqual(self.check_roundtrip("a b\n", 4), ["a b\n"])
        self.assertEqual(self.check_roundtrip("abc", 10), ["abc"])

    def test_invalid_limits(self):
        for limit in [0, -1, True, False, 1.5, "10", None]:
            with self.subTest(limit=limit), self.assertRaises(ValueError):
                split_prose("text", limit)

    def test_seeded_roundtrip_corpus(self):
        rng = random.Random(20261009)
        alphabet = "abc .\n\t\r🧠é中"
        for _ in range(1000):
            text = "".join(rng.choice(alphabet) for _ in range(rng.randrange(250)))
            self.check_roundtrip(text, rng.randrange(1, 32))


if __name__ == "__main__":
    unittest.main()
