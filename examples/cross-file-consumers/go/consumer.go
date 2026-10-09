// Package consumer implements seeded XXH64 in pure Go.
// Adapted from cespare/xxhash, commit ab37246c889f9db16b606fda1c232d659df9271d.
//
// Copyright (c) 2016 Caleb Spare
//
// MIT License
//
// Permission is hereby granted, free of charge, to any person obtaining
// a copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to
// permit persons to whom the Software is furnished to do so, subject to
// the following conditions:
//
// The above copyright notice and this permission notice shall be
// included in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
// EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
// NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
// LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
// OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
// WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
package consumer

import (
	"encoding/binary"
	"math/bits"
)

const (
	prime1 uint64 = 11400714785074694791
	prime2 uint64 = 14029467366897019727
	prime3 uint64 = 1609587929392839161
	prime4 uint64 = 9650029242287828579
	prime5 uint64 = 2870177450012600261
)

// Digest holds a streaming XXH64 state. Initialize it with New or Reset.
type Digest struct {
	v1, v2, v3, v4 uint64
	total          uint64
	mem            [32]byte
	n              int
	large          bool
}

// New creates a Digest initialized with seed.
func New(seed uint64) *Digest {
	d := new(Digest)
	d.Reset(seed)
	return d
}

// Reset clears the stream and initializes its accumulators with seed.
func (d *Digest) Reset(seed uint64) {
	d.v1 = seed + prime1 + prime2
	d.v2 = seed + prime2
	d.v3 = seed
	d.v4 = seed - prime1
	d.total = 0
	d.n = 0
	d.large = false
}

// Write consumes all data and copies any buffered tail.
func (d *Digest) Write(data []byte) (int, error) {
	n := len(data)
	d.total += uint64(n)

	if len(data) < len(d.mem)-d.n {
		copy(d.mem[d.n:], data)
		d.n += len(data)
		return n, nil
	}

	d.large = true
	if d.n > 0 {
		c := copy(d.mem[d.n:], data)
		d.v1 = round(d.v1, u64(d.mem[0:8]))
		d.v2 = round(d.v2, u64(d.mem[8:16]))
		d.v3 = round(d.v3, u64(d.mem[16:24]))
		d.v4 = round(d.v4, u64(d.mem[24:32]))
		data = data[c:]
		d.n = 0
	}

	if len(data) >= 32 {
		data = data[writeBlocks(d, data):]
	}

	copy(d.mem[:], data)
	d.n = len(data)
	return n, nil
}

// Sum64 returns the current hash without changing the stream state.
func (d *Digest) Sum64() uint64 {
	var h uint64
	if d.large {
		h = bits.RotateLeft64(d.v1, 1) + bits.RotateLeft64(d.v2, 7) +
			bits.RotateLeft64(d.v3, 12) + bits.RotateLeft64(d.v4, 18)
		h = mergeRound(h, d.v1)
		h = mergeRound(h, d.v2)
		h = mergeRound(h, d.v3)
		h = mergeRound(h, d.v4)
	} else {
		h = d.v3 + prime5
	}
	h += d.total

	b := d.mem[:d.n]
	for len(b) >= 8 {
		h ^= round(0, u64(b[:8]))
		h = bits.RotateLeft64(h, 27)*prime1 + prime4
		b = b[8:]
	}
	if len(b) >= 4 {
		h ^= uint64(binary.LittleEndian.Uint32(b[:4])) * prime1
		h = bits.RotateLeft64(h, 23)*prime2 + prime3
		b = b[4:]
	}
	for _, c := range b {
		h ^= uint64(c) * prime5
		h = bits.RotateLeft64(h, 11) * prime1
	}

	h ^= h >> 33
	h *= prime2
	h ^= h >> 29
	h *= prime3
	h ^= h >> 32
	return h
}

// Sum64 computes the seeded XXH64 hash of data.
func Sum64(data []byte, seed uint64) uint64 {
	var d Digest
	d.Reset(seed)
	d.Write(data)
	return d.Sum64()
}

func writeBlocks(d *Digest, b []byte) int {
	v1, v2, v3, v4 := d.v1, d.v2, d.v3, d.v4
	n := len(b)
	for len(b) >= 32 {
		v1 = round(v1, u64(b[0:8:len(b)]))
		v2 = round(v2, u64(b[8:16:len(b)]))
		v3 = round(v3, u64(b[16:24:len(b)]))
		v4 = round(v4, u64(b[24:32:len(b)]))
		b = b[32:len(b):len(b)]
	}
	d.v1, d.v2, d.v3, d.v4 = v1, v2, v3, v4
	return n - len(b)
}

func u64(b []byte) uint64 {
	return binary.LittleEndian.Uint64(b)
}

func round(acc, input uint64) uint64 {
	acc += input * prime2
	return bits.RotateLeft64(acc, 31) * prime1
}

func mergeRound(acc, val uint64) uint64 {
	acc ^= round(0, val)
	return acc*prime1 + prime4
}
