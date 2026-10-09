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
| Database access returns after a server-render failure                | Resetting the error boundary could reuse the failed render                        | Retry reloads the page and requests fresh server data                                                          |
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
  unavailable-page recovery and narrow/wide layouts. No browser console errors were observed in healthy-flow checks;
  the checked layouts had no horizontal overflow. This is not a complete accessibility audit.
- An isolated database failure returned health status 503 and the page recovery view. After
  restoring database access in the same process, health returned 200 and the revised retry
  button recovered the actual catalog. The main database was not altered for this fault test.
- The existing SQLite database was backed up with SQLite's backup API before starting the
  revised runtime. The schema changes are additive.
- CI uses read-only repository permission, does not retain checkout credentials, pins official
  action releases by commit, uses Ubuntu 24.04 and tests the app on Node.js 22. GitHub CI results
  for a particular commit remain the authoritative remote verification record.

## Remaining verification gates

OAuth setup preparation on 2026-10-08 added explicit provider-token expiry handling. GitHub's
`expires_at` is retained in the encrypted JWT; the session ends with a one-minute request
margin and requires sign-in again. Invalid declared expiries fail closed, refresh tokens
are not retained, and legacy non-expiring apps remain supported. Both the Auth.js callback
and the server-side token reader enforce this boundary. Real encrypted-cookie tests exercise
the Auth.js session endpoint, verifying identity-only output and expired-cookie deletion.
All 100 app tests and three independent consumer tests pass, along with type checking,
formatting, a production build and a dependency audit with zero reported vulnerabilities.

Real GitHub OAuth was verified on the local production build at `http://127.0.0.1:3187`.
The registered app uses one exact callback, with token expiry enabled, wildcard redirects
disabled and device flow disabled. The initial live callback exposed Next.js normalizing
loopback IP addresses to `localhost` during the token exchange. Disabling URL normalization
preserves the registered origin; regression tests cover the actual NextAuth handlers with
IP-based local, localhost and HTTPS origins, including an untrusted forwarded-host header.

The successful callback authenticated `seanebones-lang` and loaded 27 owned, non-fork public
repositories. Direct GitHub identity verification confirmed the numeric user ID and exactly
`read:user` scope. The real session cookie decrypted correctly, was HTTP-only with SameSite
Lax, and retained the provider's eight-hour expiry without a refresh token. The public session
endpoint returned identity without provider tokens. Sign-out deleted the session cookie and
restored the sign-in gate; repeat sign-in returned to the authenticated dashboard. Credentials
are configured only in the ignored, owner-readable local environment file. The cookie is not
Secure on this HTTP local preview; HTTPS production must use the secure cookie.

The subsequent authenticated local pilot completed two real Anthropic analyses with
`claude-haiku-5-5`, persisted a source-pinned listing and exercised its component page,
clipboard brief and JSON export. The recommended parser also passed three checks in a
separate Node-only consumer after extraction from complete pinned source. The pilot exposed
and fixed identifier sanitization and undisclosed text truncation. All 102 app tests and
the existing three consumer tests pass, with formatting, type checking and a production build.
See [the pilot record](PILOT.md) for provider usage, estimated cost and extraction adaptations.
Owner review remains pending; no owner confirmation or independent-test badge was fabricated.
That initial pilot established provider operation and one working adaptation. No paid analysis
occurred during the earlier OAuth-only verification.

The expanded pilot completed nine real analyses across seven public repositories, leaving
34 current candidates. Observed usage gives a cumulative $0.043581 estimate; the provider's
balance was not verified. A complete pinned circuit-breaker extraction passed three additional
checks in a fresh Node consumer. A live brief exposed removal of arrow/generic punctuation;
the parser now preserves code syntax in escaped text, with regression coverage. All 103 app
tests and the three existing example tests passed, along with formatting, TypeScript checks
and a production build. The two additional isolated consumers passed six checks in total.
See [the expanded pilot record](PILOT-MATRIX.md) for exact commits, usage, recording scope
and source/licensing gaps. No owner reviews or catalog independent-test badges were added.

The subsequent agent milestone added versioned search/inspection, a downloadable standalone
CLI, machine documentation and explicit coverage/license/dependency uncertainty. An installed
CLI in a fresh workspace completed discovery, pinned-source fetch and three circuit-breaker
consumer checks without an app runtime dependency or paid provider call. All 116 app checks,
nine CLI checks and three existing example checks passed. The real local catalog returned all
34 parts over two schema-validated pages; mobile/desktop guide layouts had no page overflow.
See [agent retrieval validation](AGENT-VALIDATION.md) for exact evidence and limits. This is
script-consumer validation, not adoption or an independent model-agent benchmark.

The Docker daemon is unavailable. The supplied Dockerfile has not been executed in this
review. Validate image build, unprivileged runtime, a mounted persistent database and restart
persistence before deployment. Local standalone success does not prove container success.

There is no public deployment, production load test or user adoption evidence. The single-instance
SQLite and fresh GitHub-verification strategy suit a small curated pilot. Measuring response time
and GitHub allowance consumption with a real pilot is required before expanding the catalog.

## Next product evidence

The pilot completed contributions across seven codebases and two independent consumer
adaptations. The discovery-to-fetch exercise is now complete, following
[the agent interface](AGENT-INTERFACE.md). The next evidence is author review and a separate
agent client exercising discovery and owner-authorized contribution drafts. Improve sampling of
complete functions and their local dependencies: current prefix samples can exclude the actual
candidate implementation. Add precise coverage and component-license context before default
automatic extraction; the expanded pilot exposed vendored licensing and omitted-file claims.
Record what imports were missed, what adaptation was needed and whether owner review improves the brief.
Downloads, copied briefs, owner review and anonymous reuse counters alone do not establish
successful reuse.

## Private agent contributions — 2026-10-08

Added expiring, repository-scoped, revocable draft-only credentials; private
idempotent proposal API; owner inbox and explicit paid approval; CLI prepare/read
commands; and a matching OpenAPI/machine guide. Drafts cannot change public
catalog evidence or claim owner review. Publication is pinned to the reviewed
commit and uses existing quota/reservation controls. Revocation, expiry, dismissal
and listing removal block late publication. Issuer verification and private
requests are bounded per owner; responses and stored rows omit plaintext secrets.

Validation: 157 offline checks, production build/typecheck/format/audit, fresh
installed-CLI draft flow with real GitHub in a disposable database, and three
fresh source-consumer behavior checks. No new model charge or live-owner credential
was created. See AGENT-VALIDATION.md for the exact package/source identities and
limits. MCP, automatic agent publication, retention cleanup and larger-scale
validation remain outside this milestone.
