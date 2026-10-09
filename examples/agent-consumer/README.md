# Discovery-to-consumer example

This example uses the installable CLI against a running Repo Salvage instance
containing the public Brainstormin-System circuit-breaker listing from the local
pilot. An empty installation will have no such result; this is not seeded catalog
data and requires no paid request when that listing already exists.

Start in a fresh consumer directory outside the app. Download `/repo-salvage-cli.tgz`
from your trusted running instance and install it:

```sh
npm init -y
npm install ./repo-salvage-cli.tgz --ignore-scripts
npx --no-install repo-salvage search --base http://127.0.0.1:3187 \
  --q "circuit breaker" --language TypeScript --license MIT
```

Choose the result with primary path `src/lib/circuitBreaker.ts`. Use its IDs for
inspection and fetch. Inspect the brief and source before executing an adaptation.

```sh
npx --no-install repo-salvage inspect LISTING_ID PART_ID --base http://127.0.0.1:3187
npx --no-install repo-salvage fetch LISTING_ID PART_ID --base http://127.0.0.1:3187 --out ./fetched
```

Check the retained notice and `fetched/repo-salvage-manifest.json`. The example
targets commit `120f8b40de0446fe98c13c604ec4281d0f83185d`; the transpiler refuses
another version. Copy `transpile.mjs` and `consumer.test.mjs` from this example into
your fresh consumer directory, then explicitly install the compiler and test:

```sh
npm install --save-dev typescript@5.9.3 --ignore-scripts
node transpile.mjs ./fetched
node --test consumer.test.mjs
```

The complete file is transpiled to an ES module with no implementation edits.
TypeScript is a build dependency; the resulting module has no runtime imports.
The original MIT notice stays with the fetched source. Three sequential behavior
checks cover trip/suppression, reset and recovery after timeout. Concurrent
half-open requests, production load and security were not tested.

CLI integrity checks prove downloaded bytes agree with the Git blob hashes
returned by the selected catalog's pinned tree. They are not independent identity
verification. The manifest retains analysis uncertainty and does not claim these
consumer tests were run. Keep test output and adaptations as a separate record.
This example tests retrieval from an already populated instance; it is not part
of the offline CI suite and does not publish or modify a listing.
