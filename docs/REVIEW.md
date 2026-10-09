# Review and verification record

Reviewed 2026-10-08 against the v0.2 foundation merged in `f2fda49`.
This review examined publication, source sampling, public visibility, owner review,
reporting, moderation, consumer exports, setup states and local production behavior.

## Gaps fixed

| Trigger                                                              | Previous behavior                                                                 | Result                                                                                                         |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Owner removes a listing while analysis is running                    | A late result could insert the listing again                                      | Expiring, transactional publication reservations are canceled by removal                                       |
| Owner removes or replaces a listing during its initial GitHub lookup | The older request could start a new analysis afterward                            | The captured listing identity and analysis timestamp must still match before reservation                       |
| Two requests analyze the same repository                             | Both could invoke the provider and the last completion could overwrite newer work | Only one active reservation per repository; expired tokens cannot publish or release a replacement reservation |
| A moderator hides a listing while GitHub verification is pending     | The earlier database snapshot could still render or export it                     | Public reads re-read local state after verification and require the same repository and owner                  |
| Owner removes a listing during report upload                         | A report could be inserted without a remaining listing                            | The insert requires an existing, locally visible listing                                                       |
| Raw source is large or stalls                                        | The response was fully buffered with no download timeout                          | Ten-second timeout, streamed 24 KB prefix, 6,000 characters per supplied file and 70,000 total                 |
| A primary source file is truncated                                   | Disclosure depended on model output                                               | The app appends a limitation from the actual sample metadata                                                   |
| Provider requests stall or retry                                     | SDK defaults could keep work alive for minutes and make repeated calls            | Two-minute timeout and no automatic SDK retries; an expired publication token fails closed                     |
| OAuth is configured but the analysis provider is absent              | Submission could consume quota before failing                                     | Analysis is disabled and rejected before source requests or quota consumption; removal still works             |
| More than 200 reports are unresolved                                 | Older reports and restoration controls could become unreachable                   | Stable, indexed pagination reaches the complete unresolved queue                                               |
| A listing is missing or a page fails                                 | Default framework recovery                                                        | Branded unavailable-page and retry controls                                                                    |

Removal cancels publication, not a provider request that has already reached the provider.
The app checks cancellation before starting analysis after sampling. A provider timeout does
not establish that no provider work or billing occurred.

## Evidence collected

- 79 Vitest checks plus three standalone Node consumer tests passed. Regression coverage includes
  real SQLite persistence with a deferred provider response and a deferred report body, not only
  synchronous mocks. GitHub, authentication and the paid provider are mocked in that flow.
- Populated catalog rendering checked page clamping, filter preservation, final-page contents,
  malformed page numbers and empty-result recovery. A 205-report queue test checked that every
  report is reachable, without duplicates, including hide and restore of the oldest report.
- Formatting, TypeScript checks, dependency audit and production build passed locally.
  The dependency audit reported zero vulnerabilities.
- A separate live GitHub check used the reviewed helpers against this repository's numeric
  identity. It resolved a real commit, downloaded the actual public source and asserted that
  every supplied path exists and both file and aggregate character bounds hold. It did not
  invoke the AI provider or publish a listing.
- The standalone production build was started independently of the source checkout. Direct HTTP
  checks covered home, examples, the component example, field guide, dashboard, health, JSON
  export and archive. Missing listings, exports and unauthorized moderation returned 404.
- Browser checks covered search submission, component navigation, copy success, setup messaging,
  unavailable-page recovery and narrow/wide layouts. No browser console errors were observed;
  the checked layouts had no horizontal overflow. This is not a complete accessibility audit.
- The existing SQLite database was backed up with SQLite's backup API before starting the
  revised runtime. The schema changes are additive.
- CI uses read-only repository permission, does not retain checkout credentials, pins official
  action releases by commit, uses Ubuntu 24.04 and tests the app on Node.js 22. GitHub CI results
  for a particular commit remain the authoritative remote verification record.

## Remaining verification gates

No GitHub OAuth app credentials or Anthropic API key are configured in this workspace.
A real callback, encrypted session, authenticated owner workflow and successful paid analysis
must be exercised together before claiming the contribution flow is live. Configuration and
mocked success do not establish account access, provider availability or summary quality.

The Docker daemon is unavailable. The supplied Dockerfile has not been executed in this
review. Validate image build, unprivileged runtime, a mounted persistent database and restart
persistence before deployment. Local standalone success does not prove container success.

There is no public deployment, production load test or user adoption evidence. The single-instance
SQLite and fresh GitHub-verification strategy suit a small curated pilot. Measuring response time
and GitHub allowance consumption with a real pilot is required before expanding the catalog.

## Next product evidence

The highest-value next step is a complete licensed contribution followed by an independent
consumer taking a recommended component into another project. Record what imports were missed,
what adaptation was needed and whether the owner's review improved the brief. Use those results
to prioritize extraction assistance and better sampling. Downloads, copied briefs, owner review
and anonymous reuse counters alone do not establish successful reuse.
