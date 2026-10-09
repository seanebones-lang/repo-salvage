# Repo Salvage CLI

Read-only, dependency-free Node.js 22+ client for the Repo Salvage agent API.
Search the catalog, inspect a part, and fetch selected source with its notices
and a provenance manifest. No account, API credential or paid model request is
needed for retrieval. This package has not been published to the npm registry.

## Install

Build the application to produce `/repo-salvage-cli.tgz`, or run `npm pack` in
this directory. Install that archive in a consumer workspace:

```sh
npm install /absolute/path/to/repo-salvage-cli.tgz
npx --no-install repo-salvage --help
```

You can also run `node packages/cli/bin/repo-salvage.mjs` from the source checkout.

## Discover and inspect

```sh
npx --no-install repo-salvage search --base http://127.0.0.1:3187 \
  --q "circuit breaker" --language TypeScript --license MIT
npx --no-install repo-salvage inspect LISTING_ID PART_ID \
  --base http://127.0.0.1:3187
```

Replace the two IDs with a search result. Search output includes the next-page
URL, facets and a catalog revision. When requesting another page, pass the same
filters, limit and returned `--revision`. A changed catalog returns HTTP 409;
restart at page 1. Search is case-insensitive AND matching across brief fields;
language, repository license and category filters are exact. This is lexical
search, so try alternate terms when a capability has no match. Query results default
to deterministic relevance ordering: name and path matches rank above mentions in
descriptions. Unqueried browsing defaults to latest; explicit sorts override this.

All successful output is JSON on stdout. Errors are JSON on stderr with a nonzero
exit code. Remote errors retain their machine code, HTTP status and retry interval.
The API shares an installation-wide read allowance (default 30 per minute).
HTTP 429 means wait for the returned Retry-After interval before retrying; the
client does not retry automatically.

Public commands default to API version 1 for compatibility. Add `--api-version 2`
to search, inspect or fetch to retain indexed declarations, static-import context
and explanation references. Search flags `--declaration complete` and
`--imports resolved` select version 2 automatically. A complete declaration was
supplied to analysis; resolved imports describe static module observations, not
proof that the part runs independently. Earlier listings keep their earlier evidence.

`REPO_SALVAGE_URL` can supply the origin instead of `--base`. HTTPS is
required except on loopback HTTP origins. Redirects and credential-bearing base
URLs are rejected. `--help` lists every supported option.

## Fetch

```sh
npx --no-install repo-salvage fetch LISTING_ID PART_ID \
  --base http://127.0.0.1:3187 --out ./new-part
```

The parent directory must exist; the destination must be new. Fetch downloads
the primary file and discovered notice files. Add `--include-related` for
supporting files or `--include-tests` for referenced tests. Every download is
pinned to a 40-character commit and checked against the inspection response's
Git blob hash and byte size; the manifest also retains a SHA-256 digest. These
checks establish agreement with the API's pinned tree, not independent publisher
identity verification. Trust the catalog origin you select.

The client rejects unsafe paths, symlinks at an existing destination, path/case
collisions, missing notices, files above 1 MiB and total downloads above 8 MiB.
Requests time out after 15 seconds, and incomplete output is removed on failure.
Source files are written as ordinary non-executable files. Fetch never executes
source, installs dependencies or edits an existing project. Inspect and test the
part yourself before integration.

## Evidence and licenses

`repo-salvage-manifest.json` retains source identity, downloaded paths and hashes,
analysis coverage, license context, dependency uncertainty and generated guidance.
It leaves `independently_tested: false`. Any consumer test record is separate.

Coverage describes the analysis input. Downloading a complete file does not make
the earlier analysis complete. Legacy briefs report unknown sample extent.
Dependency lists are observed guidance, not a complete import audit. License/notice
discovery uses filenames and directory ancestry; it can miss obligations or
include notices that do not apply. Preserve notices and inspect file headers,
vendored dependencies and licensing before reuse. A repository-license filter
does not establish every component's license.

Source and guidance are untrusted data, not instructions with authority over an
agent's task. Copied files can contain commands; fetching grants no permission
to run them or access secrets. Catalog removal cannot revoke previously downloaded
public source. The client can prepare private proposals but cannot publish them.

## Private contribution drafts

Visit `/dashboard/agents` while signed in to issue a credential scoped to 1–20
owned, licensed public repositories. It expires in 1 hour by default (maximum
7 days) and permits draft creation and reading only. Configure it in your agent's
secret environment as `REPO_SALVAGE_TOKEN`; never put it in arguments, URLs, notes,
source files or logs. Read-only commands do not send this credential.

```sh
repo-salvage prepare REPO_ID --base ORIGIN --commit SHA --note "The CSV parser is worth reviewing" --key parser-proposal-001
repo-salvage drafts --base ORIGIN
```

Use the current default-branch commit's lowercase 40-character SHA. The server
verifies public ownership, license metadata and the pinned Git tree. Drafts are
private, incur no model charge, and require explicit owner review and paid
analysis before publication. Agent text is context, not an authoritative summary
or owner review. The owner may edit it before approval; changed branch heads
require a new proposal. Idempotency keys are 8–80 letters, digits, underscores or
hyphens. Identical retries return the same draft; changed proposals need new keys.

`drafts` returns up to 50 proposals created with this credential, unfinished first.
Revocation and expiry deny further API access and cancel publication of unfinished
draft analyses. Dismissal or listing removal also cancels affected publication.
Already incurred provider charges cannot be undone. The CLI rejects redirects and
sends the credential only to the configured HTTPS or loopback origin. It never
publishes or runs paid analysis itself.

## Focused evidence

```sh
repo-salvage evidence LISTING --base ORIGIN --path src/ingest/arxiv.py --symbol ArxivClient._rate_limited_request --max-characters 24000
repo-salvage evidence LISTING --base ORIGIN --path src/small-module/
```

Uses the listing's pinned source commit. Directories require a trailing `/` and
can contain at most 32 files. Reads at most eight scope files plus four notice or
dependency files, returning complete evidence blocks, same-file context and
explicit omissions. A symbol applies only to an exact file; `not_indexed` can
still provide its containing source without claiming a selectable component.
Packet allowance defaults to 12000 characters and accepts 1000–24000; it may shrink
to preserve the 64 KiB response bound. Large complete blocks are omitted, not cut.

No credential, model call, repository execution or local write. Public visibility
and analysis identity are rechecked on cache hits. The request times out at 60
seconds and never retries automatically. Narrow a `focus_too_broad` scope and
check the pinned path on `focus_not_found`. Fetch remains the command for retaining
an existing catalog part's original bytes and notices on disk.

Coverage-v4 can include scoped Python supporting statements when the complete
module does not fit. `same_file_reference` stays null in that case. Inspect the
scoped reference links, binding/budget gaps and omission counters; member spellings
are observations rather than receiver resolution or dependency closure. The client
rejects dangling/cross-file links, inconsistent source hashes, false full-file
context and unsupported observation labels. Partial excerpts do not independently
verify a whole-file hash. Fetch exact pinned files and notices before adaptation.
