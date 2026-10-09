# Process-local rendezvous selector

Adapted from dgryski/go-rendezvous at 9f7001d12a5f0021fd3283525f888b5814ccee27.
Retain LICENSE. No third-party packages. Run offline:

```sh
GOTOOLCHAIN=local GOPROXY=off GOSUMDB=off GOWORK=off go test -count=1 consumer.go acceptance_test.go
```

Use `New([]string{"a", "b"}, hasher)`, inspect its error, then `Lookup(key)`
returns `(node, present)`. Hasher is `func(string) uint64`; supply a consistent,
non-reentrant implementation. Add returns validation errors; Remove returns
presence. Empty and duplicate node names and nil hashers are rejected. Score
transformation retains the pinned right12/left25/right27 xorshift multiplier.
Ties prefer the earliest current index; swap-last removal can change that order.
The API and removal repair are deliberate adaptations rather than exact upstream
compatibility. Construct with New; this is not safe for concurrent use. No
persistence, distribution or scaling guarantee is claimed.

The downloadable bundle contains acceptance_test.go (the corrected pre-proposal
oracle). In the source repository, consumer_test.go belongs to the preserved,
incorrect initial freeze. Use the repository's `npm run test:native` driver,
which copies only acceptance_test.go into its disposable Go workspace.
