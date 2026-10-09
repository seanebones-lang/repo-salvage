# Native Codex host pilot

A separate Codex CLI 0.160.0 process, with a fresh installed MCP archive, completed
the task in [task.md](task.md). It received no component identity, source code,
fixture or expected answer. It used four native MCP calls to discover and inspect
the candidate, read its entire pinned primary file and discovered MIT notice, and
then wrote/tested a standard-library Python consumer in its isolated workspace.

The original host output passed six tests. Parent verification independently
checked the exact source and notice hashes, reviewed the extraction, and added
fixed upstream vectors, stable string input validation and exact zero/one split
endpoints. The [reviewed consumer](../assignment-consumer/README.md) passes twelve
behavior checks. The upstream catalog record was not given an independent-test
badge or changed. The example's checks apply to its adaptation only.

[results.json](results.json) records the installed archive, source reads, calls,
reported token usage and limits. Raw events and the unchanged initial output are
retained locally under ignored artifacts and a temporary consumer workspace.
No credential, user config, source application, test-provider approval or public
listing was created. Existing ChatGPT authentication supplied normal Codex account
usage; no new Anthropic request was made. The CLI default
model ID was not separately recorded, so this is host-path evidence, not a named
model performance claim.

## Reproduce the configuration

Install the MCP archive from a trusted Repo Salvage instance into an empty
workspace with `npm install ./repo-salvage-mcp.tgz --ignore-scripts`. Use these
fields in a temporary CLI override or your host's configuration:

```toml
[mcp_servers.repo_salvage]
command = "node"
args = ["/absolute/workspace/node_modules/@repo-salvage/mcp/dist/index.js", "--base", "http://127.0.0.1:3187"]
required = true
enabled_tools = ["repo_salvage_search_parts", "repo_salvage_inspect_part", "repo_salvage_read_part_file"]
```

Replace the absolute installed path and origin. The completed trial used
`codex exec --ephemeral --ignore-user-config --sandbox workspace-write --json`
with invocation-only `-c` overrides, a minimal environment, and the task text.
No `codex mcp add` or persistent user configuration change was performed. The host
was allowed to edit/test its consumer; only public read tools were exposed by MCP.

[Official MCP configuration](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)
and [non-interactive execution](https://learn.chatgpt.com/docs/non-interactive-mode)
describe these host controls. Starting another model run consumes the signed-in
account's allowance; the offline consumer checks below do not invoke a model.

```sh
python3 -m unittest discover -s examples/assignment-consumer -p 'test_*.py' -v
```

## Optional native reruns

The checked-in runner is an explicit model-use command; CI never invokes it.
It requires the existing ChatGPT login, creates a fresh installed-package workspace,
uses invocation-only configuration and forwards only a minimal environment.
It does not copy credentials or configure an API key. Raw results go into ignored
artifacts. Each evaluation question gets fresh context and only the two read tools.
Model runs have bounded timeouts and no automatic rerun.

```sh
node examples/agent-host-pilot/run.mjs --run-reuse http://127.0.0.1:3187
# Build the archive before a fresh frozen evaluation:
npm run build
node examples/agent-host-pilot/run.mjs --run-evaluation
```

The recorded ten-question trial used two concurrent sessions at a time; the
reusable runner runs sequentially. Each run is independent; do not overwrite the
committed historical record with a new score without reviewing its evidence.

## Blind catalog evaluation

Ten fresh read-only Codex sessions separately received only one question each,
the installed MCP tools and a JSON answer schema. Expected answers and recorded
calls stayed outside their workspace. All ten answers matched exactly, across
44 MCP calls, with no shell/file operations in their completed event traces.
Both relevant parts were inspected for every question. This is one run on the
authored frozen questions, not a held-out accuracy estimate or broad adoption.
See [the evaluation record](../mcp-evaluation/codex-results.json).
