# First authenticated analysis and consumer pilot

Completed locally on 2026-10-08 (America/Chicago). The application was an independently
started production build at `http://127.0.0.1:3187`, authenticated as `seanebones-lang`
through the previously verified GitHub OAuth flow. This is local execution evidence;
there is no public deployment or adoption claim.

## Source and request boundary

The author-nominated repository was the active MIT-licensed `seanebones-lang/repo-salvage`,
numeric repository ID `1407678985`, pinned to
`b53bb1be0aaed349b86f971f854cdcd529b0371b`. Both analyses used 15 public source files,
70,000 sampled characters and 12 truncated files. No private repository source was sent.

The owner note asked for the summary parser, bounded repository sampler and transactional
SQLite quota, identified UI/auth coupling, and prohibited abandonment or passing-test claims.
Each request used `claude-haiku-5-5`, medium effort, structured JSON and an 8,000-token output
ceiling. SDK retries and automatic model fallback were disabled. A free token-count preflight
used the same request builder before each generation; the second counted 30,954 input tokens
and estimated at most $0.0070954 at the published rates for that bounded request.

An unscoped personal key required `anthropic-workspace-id`. The existing Default workspace
was selected using read-only workspace metadata. Credentials were stored only in the ignored,
owner-readable local environment file. The local owner and installation quotas were limited
to two attempts, and the final database contained two attempts with no active reservation.
Those quotas count requests over 24 hours; they do not enforce a monetary budget.

## Model and cost evidence

The credential's model metadata confirmed availability and structured-output support.
Haiku 5.5 was the least expensive available compatible model at the time of this pilot.
The [official pricing table](https://platform.claude.com/docs/en/about-claude/pricing)
listed $0.10 per million input tokens and $0.50 per million output tokens for Haiku 5.5
prompts up to 100,000 tokens. Both requests were below that threshold, had no cache tokens,
and reported standard service tier and global inference. Sonnet 5.5 listed $2/$10 for
input/output; no paid Sonnet comparison was run because the cheaper model completed the pilot.

| Run                                       | Provider-reported input | Provider-reported output | Candidates | Estimated USD |
| ----------------------------------------- | ----------------------: | -----------------------: | ---------: | ------------: |
| Initial contribution                      |                  30,898 |                    3,385 |          3 |     0.0047823 |
| Re-analysis after parser and prompt fixes |                  30,954 |                    4,006 |          4 |     0.0050984 |
| Total                                     |                  61,852 |                    7,391 |          — |     0.0098807 |

Output totals already include thinking tokens (1,489 and 1,977 respectively); those were
not charged a second time in the calculation. Both responses reported `end_turn` and actual
model `claude-haiku-5-5`. The provider request IDs were
`req_011Cfqoiynf8j7C2rELjJEfJ` and `req_011Cfqp7kqvdgCUduBJSVVqX`.
These are estimates from observed usage and published prices, not verified invoices or a
verified remaining credit balance. The authorized ceiling was $5; two successful requests
were sufficient for this test.

## Result and issues fixed

The first response produced parser, sampler and SQLite candidates. Inspecting the rendered
briefs exposed application sanitization removing underscores from `table_info` and
`repo_data`, and cutting long prose mid-word without disclosure. The parser now preserves
underscores and ends capped text with an ellipsis, preferring a nearby word boundary.
Regression tests cover identifiers, word-boundary truncation, unbroken long values and
exactly-at-limit text. The prompt also states the stored text limits.

The second response produced four candidates: the parser, provider prompt/schema wrapper,
GitHub public fetch/commit resolver and SQLite schema/upsert. Its overview and descriptions
were within their limits. Recommendations pointed to supplied source and acknowledged
missing function bodies and unexecuted tests. The wrapper brief describes the older provider
call in the pinned source, not the provider implementation currently running this pilot.
The app appended its own source-prefix limitation to every truncated primary file.

The re-analysis replaced the original briefs in SQLite, retaining the same listing ID and
commit provenance. Browser verification covered the listing, parser component page and
successful clipboard copy. Direct HTTP verified a 200 JSON export with the correct source
commit, model, limitations and unset owner-review/independent-test claims. No owner review
was recorded on behalf of the author.

## Independent consumer adaptation

The parser recommendation was evaluated outside the application in a fresh temporary
directory using Node.js 22.22.3. Complete source and the MIT license were downloaded at the
pinned commit. TypeScript's compiler API selected the actual `clean`, `parseSummary` and
`verifiedSummary` declarations, plus the `CATEGORIES` constant from `src/lib/components.ts`,
then transpiled those declarations to an ES module. No implementation was rewritten.

The consumer imported only that generated module and Node's test/assert built-ins. It needed
no Anthropic, Next.js, React or SQLite runtime dependency. Type-only `Summary` and
`ReusablePiece` references were erased during transpilation. Selecting complete declarations
and retaining the category constant were the adaptations; copying the entire original file
would retain the app/provider import graph.

Three independent checks passed:

- Known source paths, related/test paths and dependencies survive, while invented primary
  paths and URL/Markdown text are discarded.
- Wrong-shaped arrays, duplicate candidates, malformed JSON and empty verified results have
  the expected behavior.
- Tree-only candidates and forged owner-review or independent-testing fields do not survive
  source verification.

The downloaded source SHA-256 hashes were:

| File                    | SHA-256                                                            |
| ----------------------- | ------------------------------------------------------------------ |
| `src/lib/summarize.ts`  | `092205d69cbe200b9fb701a2acc5c8e4d1d24bd4c664c0a75374d1fca1522122` |
| `src/lib/components.ts` | `65e593b7dbf4d742fdedd72476d09a4fbef49592b05c01b33cce092c0622e145` |
| `LICENSE`               | `677c1280e5b69ca58dd690ed7f66600bad5058969792516313b3c58561eab7cd` |

This consumer used the pinned original parser, so it retains the older text-sanitization
limitations. The new identifier/truncation fixes were verified by the current app's regression
tests. The application still exports `independently_tested: false`: the external pilot record
is not a product mechanism for storing or certifying consumer execution evidence.

## Verification scope and next evidence

The revised application passed 102 Vitest tests, the existing three standalone consumer
tests, TypeScript checks, formatting and a production build. The fresh pinned-source consumer
passed its additional three checks. The pilot did not execute the recommended GitHub or SQLite
components independently, compare multiple repositories, certify security, or test deployment.

Haiku is a justified default for this bounded brief-generation flow based on this pilot.
The next product improvement is sampling complete functions and their supporting declarations:
12 of 15 files were truncated, and even the parser body was only partly present in the prompt.
Before expanding the pilot, collect actual author review and repeat the consumer exercise on
another licensed project. Richer source evidence should be evaluated before increasing model cost.
