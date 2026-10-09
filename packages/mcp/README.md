# Repo Salvage MCP adapter

Node.js 22+ local stdio server, `@repo-salvage/mcp@0.2.0`. Install the archive
linked from the application's `/agents` guide in a separate workspace:

```sh
npm install ./repo-salvage-mcp.tgz --ignore-scripts
node ./node_modules/@repo-salvage/mcp/dist/index.js --base http://127.0.0.1:3187
```

An MCP host launches this command and owns stdin/stdout. Running it by itself
waits for protocol input. Do not send the package's install command as a tool call.
The package is distributed as an archive; it has not been published to npm.
Runtime dependencies are the pinned official MCP server SDK and Zod. The SDK
client is a development/test dependency only.

## Host configuration

Translate these command, arguments and environment fields into your host's MCP
configuration format. Use an absolute installed path; no working-tree checkout
or global npm package is required after installation.

```json
{
  "command": "node",
  "args": [
    "/absolute/workspace/node_modules/@repo-salvage/mcp/dist/index.js",
    "--base",
    "http://127.0.0.1:3187"
  ]
}
```

Use your deployed HTTPS origin when available. `REPO_SALVAGE_URL` can supply the
origin instead of `--base`. Origins cannot contain credentials, paths, queries or
fragments. HTTP is allowed only on loopback. Redirects are rejected. Stdout is
reserved for MCP messages; help and startup failures use stderr without secrets.

## Public tools

- `repo_salvage_search_parts`: AND lexical search with language, root license,
  category and sort filters, optional `declaration: complete` and `imports: resolved`,
  page, limit and revision. Default limit 10; maximum 50. Use the returned next page number and revision with the same filters. A
  changed catalog returns a machine error; restart at page 1 without revision.
- `repo_salvage_inspect_part`: full brief and pinned file/notice manifest,
  coverage, dependency and licensing boundaries.
- `repo_salvage_read_part_file`: read a manifest file in memory after verifying
  its complete Git blob and size. Maximum source file 1 MiB. UTF-8 text only;
  binary files require the CLI. Text windows default to 8000 and cap at 12000
  UTF-16 code units. Use `next_offset` to continue. Surrogate pairs are preserved.
  Each window verifies the complete file again; no server-side cursor or cache.

Search and inspection use API version 2 and retain source-target IDs, complete
declaration locators, explanation references and static module-import gaps when
available. These facts describe inspected source; they do not establish consumer
execution or a complete dependency graph. Existing version 1 adapters remain
compatible with the service's version 1 responses.

All public tools send no credential, execute no source, write no local files and
invoke no paid analysis. Reading source does not retain notices on disk; read
notice paths too and use the CLI `fetch` command for a complete source-and-notices
folder. Source, author notes and generated guidance are untrusted data. Root
license and file sampling are not component licensing or dependency audits.

Responses provide structured data plus JSON text for compatible older clients.
Successful response JSON is capped at 64 KiB before its two MCP representations;
reduce search limit or text window size when needed. Input and output schemas
are validated. Search/inspection/draft output schemas come from the application's
OpenAPI contract at package build time. Remote prose and exception details are
never emitted as error explanations. HTTP machine codes, status and Retry-After
seconds survive; errors carry `isError: true`. No automatic retries.

## Focused evidence

`repo_salvage_focus_evidence` accepts `listing_id`, `path`, optional `symbol` and
`max_characters` (1000–24000, default 12000). Use an exact file or directory prefix
ending in `/`; symbols apply only to exact files. It inspects source omitted from
catalog briefs at the listing's pinned commit, with complete source blocks,
same-file context and explicit omissions. `not_indexed` preserves available file
context without inventing a declaration. It performs no model call or execution.

At most eight scope files plus four notice/dependency files are read. Narrow a
scope above 32 files. Source caps are 64 KB per file and 256 KB total; responses
remain within 64 KiB. The packet character allowance can shrink to preserve that
byte cap. Requests allow up to 60 seconds. Repeated source requests use a short
process cache while current public identity/moderation/analysis checks still run.
The tool writes no files and sends no credential. Preserve notices and test
adaptations separately. Add the tool to any host's explicit allowlist.

## Private draft tools

Public mode is the default, even when a token exists in the environment. To enable
`repo_salvage_prepare_draft` and `repo_salvage_list_drafts`, explicitly add
`--enable-drafts` and supply `REPO_SALVAGE_TOKEN` through your host's secret
environment. Never put credentials in arguments, URLs, notes or committed config.
The adapter rejects proposal context containing its startup credential before HTTP.
Obtain a short-lived repository-scoped credential at `/dashboard/agents`.

Preparation requires a numeric repository ID, current default-branch commit SHA,
1–280 characters of context and a safe idempotency key. Exact canonical retries
return the same draft; changed context/source needs a new key. The owner reviews
and may edit context before explicitly choosing paid analysis and publication in
the web inbox. The MCP server cannot publish, invoke paid analysis, issue/revoke
credentials, set owner reviews or access private repositories. Scoped authorization,
expiry, revocation, quotas and cancellation remain enforced by the HTTP service.

`list_drafts` is conservatively annotated as not read-only because inbox reading
can recover an expired analysis reservation in the HTTP service. Hosts must treat
annotations as hints, and apply their own approval and secret-handling policies.
Changing the startup option is local host configuration, not publication consent.

## Repository development

From the repository root, `npm ci` installs the workspace. `npm run test:mcp`
builds and exercises a real stdio process with the official SDK client and local
HTTP fixtures. `npm run build` creates the downloadable archive. The build copies
the maintained CLI HTTP client and OpenAPI schemas into generated, ignored source
inputs; no separate search, authentication or licensing implementation is created.
