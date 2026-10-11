# Try Repo Salvage locally

Start with a worked example before configuring GitHub sign-in, an analysis
provider, or a hosted catalog. You need **Node.js 22**, npm, and internet access
for the initial dependency installation. Node.js 22 is checked in CI. Native
SQLite dependencies may need a compiler if a prebuilt binary is unavailable.

## Clone or download

```sh
git clone --branch v0.2.1 --depth 1 https://github.com/seanebones-lang/repo-salvage.git
cd repo-salvage
npm ci
npm run demo
```

Or download `repo-salvage-0.2.1-source.tar.gz` and `SHA256SUMS` from the
[v0.2.1 release](https://github.com/seanebones-lang/repo-salvage/releases/tag/v0.2.1).
Compare the archive's full SHA-256 with its line in `SHA256SUMS`, then extract
and run `npm ci` and `npm run demo` from `repo-salvage-0.2.1`.
On macOS/Linux use `shasum -a 256 ARCHIVE`; PowerShell uses `Get-FileHash ARCHIVE -Algorithm SHA256`.

No `.env.local`, OAuth registration, account, API key, or model download is needed
for this demo. The command builds the application, then serves it on loopback.
Open **http://127.0.0.1:3187/examples**. For a busy port use
`npm run demo -- --port 3188`. To reopen an unchanged built demo without rebuilding,
run `node scripts/demo.mjs`.

## Complete the example

1. Open **Evidence-bound summary parser**. Inspect its pinned source, dependency
   notes, limitations, MIT notice and adaptation details.
2. Download its **standalone adaptation** (`summary-parser.tar.gz`). Extract
   it into a new folder outside Repo Salvage.
3. In the extracted `summary-parser` directory run:

   ```sh
   node --test consumer.test.mjs
   ```

   These checks apply to the included JavaScript adaptation, not the entire
   upstream repository or your eventual integration. The parser uses standard
   JavaScript and needs no npm installation or provider key.

4. Visit `/agents` for the API contract and standalone CLI/MCP downloads.
   These clients query a catalog origin that you choose. A fresh demo catalog
   is empty; the curated examples are separate and do not inflate catalog counts.

Press **Ctrl+C** to close the demo. Its database lives in a fresh temporary
directory and is removed on normal shutdown. Abrupt power loss or forced process
termination can leave a temporary folder behind. The launcher overrides existing
database/credential settings, disables OAuth providers and signed-in sessions,
stops the analysis worker, and sets analysis allowances to zero. It does not
modify `.env.local` or your normal database.

## Use the agent packages

The release contains `repo-salvage-cli.tgz` (CLI **0.7.0**) and
`repo-salvage-mcp.tgz` (MCP **0.5.0**). Their independent versions describe the
clients, while **0.2.1** describes this application/release bundle.
Install downloaded archives in a separate agent workspace:

```sh
npm install ./repo-salvage-cli.tgz ./repo-salvage-mcp.tgz --ignore-scripts
npx --no-install repo-salvage --help
```

See [CLI instructions](../packages/cli/README.md) and
[MCP host configuration](../packages/mcp/README.md). No npm registry publication
is implied. MCP installation downloads its SDK dependencies; retrieval uses
the configured catalog and pinned public source. The default agent tools do
not run source code or perform paid analysis.

## Configure a real installation

For author sign-in, listing analysis and persistent data, stop the demo and
follow [the README's local setup](../README.md#local-setup) and
[hosting guide](HOSTING.md). Use the normal `npm run dev` or production/container
startup with your own configuration. For production, rebuild under your normal
configuration before starting; the demo uses the standard `.next` build output.
A hosted service requires persistent SQLite
storage, operator configuration and explicit analysis-provider credentials.
This release is free MIT source and downloadable packages; it is not a hosted
public catalog or evidence of independent adoption.
