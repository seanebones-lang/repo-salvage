// Adapted from dgryski/go-rendezvous, rdv.go, pinned at commit
// 9f7001d12a5f0021fd3283525f888b5814ccee27:
// https://github.com/dgryski/go-rendezvous/tree/9f7001d12a5f0021fd3283525f888b5814ccee27
//
// Intentional repairs: validate construction and Add before hashing or mutation;
// return explicit lookup/removal status; fix Remove's out-of-bounds indexing,
// slice shrinking, absent-node handling, and moved-node index repair.
//
// LICENSE accompaniment notice: retain the following MIT license with this
// source; include it in LICENSE when distributing this file in a package.
//
// The MIT License (MIT)
//
// Copyright (c) 2017-2020 Damian Gryski <damian@gryski.com>
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

// Package rendezvous provides single-threaded, process-local node selection.
package rendezvous

import "errors"

// Hasher maps a string to a uint64. It should return consistent results.
type Hasher func(string) uint64

// Rendezvous stores node names, cached hashes, and their current indices.
// Construct it with New. It is not safe for concurrent use.
type Rendezvous struct {
	nodes map[string]int
	nstr  []string
	nhash []uint64
	hash  Hasher
}

// New validates all names before hashing any node. An empty set is valid.
func New(nodes []string, hash Hasher) (*Rendezvous, error) {
	if hash == nil {
		return nil, errors.New("rendezvous: nil hasher")
	}

	indices := make(map[string]int, len(nodes))
	for i, node := range nodes {
		if node == "" {
			return nil, errors.New("rendezvous: empty node name")
		}
		if _, exists := indices[node]; exists {
			return nil, errors.New("rendezvous: duplicate node name")
		}
		indices[node] = i
	}

	r := &Rendezvous{
		nodes: indices,
		nstr:  append([]string(nil), nodes...),
		nhash: make([]uint64, len(nodes)),
		hash:  hash,
	}
	for i, node := range r.nstr {
		r.nhash[i] = hash(node)
	}
	return r, nil
}

// Lookup returns the highest-scoring node, or false when the set is empty.
// Ties select the earliest node in the current internal order.
func (r *Rendezvous) Lookup(key string) (string, bool) {
	if len(r.nstr) == 0 {
		return "", false
	}

	keyHash := r.hash(key)
	bestIndex := 0
	bestScore := xorshiftMult64(keyHash ^ r.nhash[0])
	for i := 1; i < len(r.nhash); i++ {
		if score := xorshiftMult64(keyHash ^ r.nhash[i]); score > bestScore {
			bestIndex = i
			bestScore = score
		}
	}
	return r.nstr[bestIndex], true
}

// Add appends a node, caching its hash once. Invalid names leave r unchanged.
func (r *Rendezvous) Add(node string) error {
	if node == "" {
		return errors.New("rendezvous: empty node name")
	}
	if _, exists := r.nodes[node]; exists {
		return errors.New("rendezvous: duplicate node name")
	}
	if r.hash == nil {
		return errors.New("rendezvous: nil hasher; use New")
	}

	nodeHash := r.hash(node)
	index := len(r.nstr)
	r.nstr = append(r.nstr, node)
	r.nhash = append(r.nhash, nodeHash)
	r.nodes[node] = index
	return nil
}

// Remove removes a present node by swapping in the last node. This can change
// the internal order used to resolve score ties. An absent node changes nothing.
func (r *Rendezvous) Remove(node string) bool {
	index, exists := r.nodes[node]
	if !exists {
		return false
	}

	last := len(r.nstr) - 1
	if index != last {
		moved := r.nstr[last]
		r.nstr[index] = moved
		r.nhash[index] = r.nhash[last]
		r.nodes[moved] = index
	}
	r.nstr[last] = ""
	r.nhash[last] = 0
	r.nstr = r.nstr[:last]
	r.nhash = r.nhash[:last]
	delete(r.nodes, node)
	return true
}

func xorshiftMult64(x uint64) uint64 {
	x ^= x >> 12
	x ^= x << 25
	x ^= x >> 27
	return x * 2685821657736338717
}
