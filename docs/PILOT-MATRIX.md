# Expanded local pilot

Completed 2026-10-08 (America/Chicago) using the authenticated standalone production
build. This extends [the first pilot](PILOT.md); all results are local, with no
public deployment, adoption or owner-review claim.

## Provider and catalog evidence

Nine real `claude-haiku-5-5` requests completed across seven author-owned public
repositories. The author approved DeadBolt and Witness under their existing
Apache-2.0 and MPL-2.0 licenses. The other five repositories reported MIT licenses.
No private source was submitted. Each primary recommendation pointed to a file
whose contents were supplied to the model, and all stored source commits matched
the sampled fixtures. Supporting paths can still be tree-only evidence.

| Repository / run             | Input tokens | Output tokens | Returned candidates | Estimated USD |
| ---------------------------- | -----------: | ------------: | ------------------: | ------------: |
| repo-salvage, initial        |       30,898 |         3,385 |                   3 |     0.0047823 |
| repo-salvage, repeat         |       30,954 |         4,006 |                   4 |     0.0050984 |
| Brainstormin-System, initial |       30,772 |         1,946 |                   5 |     0.0040502 |
| Brainstormin-System, repeat  |       30,772 |         2,592 |                   6 |     0.0043732 |
| personal-RAG                 |       31,068 |         4,203 |                   4 |     0.0052083 |
| evidencelens                 |       36,837 |         5,217 |                   4 |     0.0062922 |
| btcpredictor                 |       29,262 |         4,809 |                   5 |     0.0053307 |
| deadbolt                     |       30,755 |         2,105 |                   5 |     0.0041280 |
| witness                      |       28,732 |         2,889 |                   6 |     0.0043177 |
| Total                        |      280,050 |        31,152 |                   — |     0.0435810 |

Re-analysis replaced previous briefs, leaving seven local listings and 34 current
candidates. All responses reported the requested actual model and `end_turn`.
Cache usage was zero. Output counts already include thinking tokens. Estimates
use the [official pricing table](https://platform.claude.com/docs/en/about-claude/pricing)
at $0.10/$0.50 per million input/output tokens for these below-100,000-token
requests. The provider balance and invoice were not verified. The authorized
ceiling was $5; no further paid calls were needed. Local rolling allowances were
set to nine attempts and consumed, with no active publication reservation.

| Repository          | Pinned source commit                       | Current candidates |
| ------------------- | ------------------------------------------ | -----------------: |
| repo-salvage        | `b53bb1be0aaed349b86f971f854cdcd529b0371b` |                  4 |
| Brainstormin-System | `120f8b40de0446fe98c13c604ec4281d0f83185d` |                  6 |
| personal-RAG        | `7d979a2cecdc3e588a7d3e8b65cd2ef7664fec66` |                  4 |
| evidencelens        | `49acea5a30a5a94b0961d89c9c8c0a450d355615` |                  4 |
| btcpredictor        | `aaac31375effca4d862e719d90ac078b8fb7696b` |                  5 |
| deadbolt            | `71f2083062d4eed6874a35fff967c38b0d78306f` |                  5 |
| witness             | `482ce52011d55c4991cd7dc73fa103c9527c43ab` |                  6 |

## Additional consumer and application checks

The Brainstormin-System circuit breaker was downloaded as complete pinned source
into a fresh Node.js 22.22.3 consumer directory. The whole TypeScript file was
transpiled to an ES module with no implementation changes or runtime dependencies;
the original MIT license was retained. Three checks passed: consecutive failures
trip the breaker and suppress subsequent calls; reset restores execution; elapsed
timeout permits a successful recovery probe. Concurrent half-open calls and
production load were not tested.

| Download                    | SHA-256                                                            |
| --------------------------- | ------------------------------------------------------------------ |
| `src/lib/circuitBreaker.ts` | `4f23280d8ba2364a8a20d660c517c7c272e24ed894205c3961b8f9995c12fd4a` |
| `LICENSE`                   | `ea8f3bf6e196fc163a30dcb580af8cd4b77b9509b6f018cf8c9681ee9b7329c7` |

Together with the first parser extraction, there are six passing checks in two
fresh consumer workspaces. This does not certify the other candidates. Product
exports retain `independently_tested: false` and owner reviews remain unset.

The circuit-breaker brief exposed another application bug: sanitization changed
`execute(() => yourPromise)` by deleting `>`. It also removed generic, array and
language-name punctuation. The parser now preserves these characters while
removing URLs and recognizable Markdown formatting. Rendered fields use escaped
React text. A regression covers arrow functions, `Array<T>`, `T[]`, C# and
arithmetic. The revised application passed 103 Vitest checks, the three existing
standalone example tests, formatting, TypeScript checks and a production build.
The authenticated browser verified revised briefs and clipboard export; direct
HTTP JSON checks confirmed pinned provenance and preserved arrow syntax.

## Gaps exposed by broader source diversity

- Prefix sampling remains incomplete: sampled files are bounded to 6,000
  characters and source selection excludes code files of 20 KB or larger. Local
  dependencies and complete implementations can be absent. Supplying a primary
  file does not prove the recommended declaration was included in its prefix.
- btcpredictor's repository language is Jupyter Notebook, but this pilot sampled
  Python files. It did not inspect or execute notebook cells.
- DeadBolt's repository license is Apache-2.0, while a recommended vendored
  `option-ext` file carries MPL-2.0 context. Root metadata cannot determine the
  license of every component. File notices and third-party license boundaries
  must be preserved and checked before extraction.
- One DeadBolt brief described an omitted supporting file as truncated. Primary
  path verification does not validate every generated factual statement. Owner
  review and precise per-file coverage are still needed.
- Recommendations can depend on project configuration or application imports.
  No complete import graph or extraction package is generated for catalog parts.

These observations support better evidence and dependency sampling before buying
a more expensive model. They also inform the proposed [agent interface](AGENT-INTERFACE.md).

## Recording evidence

Browser interactions were captured as 15 bounded tab-recording segments, retaining
335 original JPEG frames, timestamps and scene markers in ignored local artifacts.
Native continuous desktop capture could not be established. An approximately
18-minute timeline master holds the last captured frame during gaps between
segments; an approximately three-minute interaction version joins the segments.
Both are silent H.264 videos. These are source footage for an edit, not a completed
promotional video or a continuous recording of terminal work.
