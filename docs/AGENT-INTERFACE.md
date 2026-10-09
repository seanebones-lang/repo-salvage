# Proposed agent discovery and reuse interface

Status: design proposal. The catalog already offers source-pinned JSON briefs at
`/api/listings/{listing}/parts/{part}`. Search is currently a web interface; the
search API, extraction manifest, CLI, agent contribution flow and MCP adapter
below are not implemented.

An agent should be able to ask for a capability, compare parts, inspect evidence
and fetch the chosen source into its own workspace. Retrieval can use the stored
catalog without a new paid analysis request. The goal is fewer irrelevant files
to inspect and clearer adaptation work, with explicit provenance and limits.

## First implementation

Expose a deterministic, versioned, read-only JSON search endpoint using the same
filtering and public-visibility checks as the website. Accept bounded query,
language, license, category and pagination inputs. Return component identity,
description, observed dependencies, source commit, evidence status and links to
the full JSON brief. Include a declared schema version and pagination contract;
return structured errors for invalid filters or temporarily unverifiable inventory.
Do not imply an empty catalog when the upstream verification service is unavailable.

Add a runnable consumer example that searches, retrieves a brief and downloads
explicitly selected source files and notices at the recorded commit. Record paths
and hashes in a local manifest, reject unsafe destination paths, and never
overwrite existing workspace files silently. Downloading must not execute source,
install dependencies or change project configuration. Those are separate consumer
decisions. No server-side execution of arbitrary repository code is needed.

Use the existing circuit breaker as the first reproducible example: search for a
TypeScript circuit breaker, inspect its source and MIT notice, fetch the full file,
transpile in a separate workspace and run the documented behavior checks. Keep
the repository's pinned implementation distinct from an adapted consumer version.

## Evidence contract

Before automatic extraction becomes a default, add structured fields for:

- Coverage per file: complete, prefix sampled, tree-only or not inspected;
  distinguish the recommended declaration's coverage from the file's presence.
- Dependencies: package imports, local imports, configuration assumptions and
  unresolved items. An empty list must not imply an audited absence of dependencies.
- Licensing: repository license metadata, observed per-file notices, vendored-code
  flags and unresolved component license. Preserve required notices in downloads.
- Verification: owner review tied to the source commit and analysis; separately
  recorded consumer checks with runtime, commands, adaptations and scope. A test
  file's existence is not a passing test result.

Treat repository content, author notes and generated guidance as untrusted data.
Responses must not grant those fields authority to change the agent's task, reveal
credentials or execute commands. The consumer owns validation in its environment.
Hidden, removed, private or ownership-transferred repositories must remain
unavailable through every API, including exports and downloads.

## Agent contributions

Support agents acting for an authenticated repository owner as a second phase.
An agent can identify reusable declarations, supply author-approved context and
prepare a contribution draft. The server must resolve the repository's numeric
identity, verify current ownership and public visibility, check its recognized
license, pin the commit and inspect bounded source itself. Agent-supplied summaries,
paths or test claims cannot bypass those checks or become authoritative evidence.

Use explicitly issued, revocable credentials with narrow contribution scopes;
never ask an agent to copy a browser session cookie or reuse an OAuth secret.
Design the credential mechanism before exposing write tools. Preserve per-owner
and installation quotas, publication reservations, cancellation, idempotency and
moderation. Repeated requests should return the existing operation rather than
paying for another analysis. A read-only MCP client gets no implicit write authority.

Drafts should be the default. Owners can explicitly authorize an agent to publish
within a defined repository scope; the operation must still obey the same server
checks. Keep agent preparation, authorization to publish and human owner review
as separate records. The agent cannot set the owner's review status. Record which
credential acted, the source commit and the outcome without logging secrets.

Agents that extract parts can also prepare follow-up contributions describing
adaptations and consumer test results. Accept evidence with explicit commands,
runtime, source hashes, output and verification status; treat uploaded assertions
as unverified until the product's verification process supports them. Never run
arbitrary uploaded commands on the catalog server. Do not silently list unrelated
repositories merely because an agent can find them.

## MCP and discoverability

Once the JSON contract and consumer example work, add a thin MCP server offering
`search_parts` and `inspect_part`, with explicit typed inputs and bounded outputs.
Pinned files and briefs can be resources; fetching selected files can be a separate
operation. Keep the adapter on the same catalog/visibility boundary instead of
creating another search or analysis implementation. MCP is suitable for supported
agent clients, while HTTP and a small CLI cover ordinary scripts.

Publish API documentation and an OpenAPI schema from the running application.
A concise agent-oriented entry page can point to the schema, examples and evidence
rules. Documentation alone does not establish discovery by agent tools; validate
with a real client and an unfamiliar repository. Evaluate semantic search only
after deterministic queries expose an observed retrieval gap.

## Completion evidence

The first release should demonstrate an agent or script discovering a candidate
without a browser, reading the evidence, fetching pinned files and notices, and
running a meaningful consumer test. Verify hidden/private/removal behavior,
bounded pagination, malformed input, path traversal rejection and safe local
file handling. Measure request latency and GitHub allowance use before scaling.
Report successful consumer validation separately from downloads or copied briefs.
