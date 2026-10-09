"""Operator-owned acceptance contract, frozen before analysis and adaptation."""
import collections
import random
import unittest
from consumer import LRUCache


class CacheContract(unittest.TestCase):
    def test_missing_and_none(self):
        c = LRUCache(2)
        self.assertEqual(c.maxsize, 2)
        self.assertEqual(c.currsize, 0)
        with self.assertRaises(KeyError):
            _ = c['missing']
        self.assertEqual(c.get('missing', 7), 7)
        c['a'] = None
        self.assertIsNone(c['a'])
        self.assertIn('a', c)

    def test_read_promotes(self):
        c = LRUCache(2)
        c['a'], c['b'] = 1, 2
        self.assertEqual(c['a'], 1)
        c['c'] = 3
        self.assertNotIn('b', c)
        self.assertEqual(dict(c), {'a': 1, 'c': 3})

    def test_get_promotes_but_membership_does_not(self):
        c = LRUCache(2)
        c['a'], c['b'] = 1, 2
        self.assertIn('a', c)
        c['c'] = 3
        self.assertNotIn('a', c)
        self.assertEqual(c.get('b'), 2)
        c['d'] = 4
        self.assertNotIn('c', c)

    def test_overwrite_promotes_without_growing(self):
        c = LRUCache(2)
        c['a'], c['b'] = 1, 2
        c['a'] = 4
        self.assertEqual(c.currsize, 2)
        c['c'] = 3
        self.assertNotIn('b', c)
        self.assertEqual(c['a'], 4)

    def test_delete_clear_and_reuse(self):
        c = LRUCache(2)
        c['a'], c['b'] = 1, 2
        del c['a']
        with self.assertRaises(KeyError):
            del c['a']
        c['c'] = 3
        self.assertEqual(c.currsize, 2)
        c.clear()
        self.assertEqual(list(c), [])
        self.assertEqual(c.currsize, 0)
        c['d'] = 4
        self.assertEqual(c.popitem(), ('d', 4))
        with self.assertRaises(KeyError):
            c.popitem()

    def test_zero_capacity(self):
        c = LRUCache(0)
        with self.assertRaises(ValueError):
            c['a'] = 1
        self.assertEqual(len(c), 0)

    def test_invalid_capacities(self):
        for n in [-1, True, False, 1.5, '2', None]:
            with self.subTest(n=n), self.assertRaises(ValueError):
                LRUCache(n)

    def test_single_slot_and_hashable_keys(self):
        c = LRUCache(1)
        c[(1, 2)] = object()
        c['b'] = 7
        self.assertNotIn((1, 2), c)
        self.assertEqual(c.currsize, 1)
        with self.assertRaises(TypeError):
            c[[]] = 3
        self.assertEqual(c['b'], 7)

    def test_mutable_mapping_operations(self):
        c = LRUCache(2)
        self.assertEqual(c.setdefault('a', 1), 1)
        self.assertEqual(c.setdefault('a', 9), 1)
        c.update({'b': 2})
        self.assertEqual(c.pop('a'), 1)
        self.assertEqual(c.pop('missing', 8), 8)
        with self.assertRaises(KeyError):
            c.pop('missing')

    def test_randomized_reference_model(self):
        for capacity in range(1, 6):
            rng = random.Random(931 + capacity)
            c, ref = LRUCache(capacity), collections.OrderedDict()
            for _ in range(400):
                key, value, op = rng.randrange(9), rng.randrange(100), rng.randrange(6)
                if op == 0:
                    c[key] = value
                    ref[key] = value
                    ref.move_to_end(key)
                    if len(ref) > capacity:
                        ref.popitem(last=False)
                elif op == 1:
                    if key in ref:
                        expected = ref[key]
                        ref.move_to_end(key)
                        self.assertEqual(c[key], expected)
                    else:
                        with self.assertRaises(KeyError):
                            _ = c[key]
                elif op == 2:
                    self.assertEqual(key in c, key in ref)
                elif op == 3:
                    if key in ref:
                        del ref[key]
                        del c[key]
                    else:
                        with self.assertRaises(KeyError):
                            del c[key]
                elif op == 4:
                    if ref:
                        self.assertEqual(c.popitem(), ref.popitem(last=False))
                    else:
                        with self.assertRaises(KeyError):
                            c.popitem()
                else:
                    c.clear()
                    ref.clear()
                self.assertEqual(set(c), set(ref))
                self.assertEqual(c.currsize, len(ref))
                self.assertLessEqual(len(c), capacity)
                # Membership and iteration must not promote entries.
                # Reading for comparison would change the reference order.


if __name__ == '__main__':
    unittest.main()
