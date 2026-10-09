# Frozen interpretation controls

Four authored controls freeze Python pure-function evidence, missing imports and
source instructions, class/same-file-helper context, and an author exclusion.
`packets.json` contains the exact shared system prompt, input, schema, source index
and request hash. Expectations and review points stay outside a model's workspace.
These are development controls, not independent or unseen repository holdouts.

CI checks that source inspection produces the frozen requests without invoking a
provider. A deliberate engine change requires reviewing and re-freezing controls
**before** the next model run, with `node examples/analysis-evaluation/freeze.mjs --freeze`.

Explicit operator commands consume the selected provider/account allowance:

```sh
node examples/analysis-evaluation/run.mjs --codex YOUR_EXPLICIT_MODEL
node --env-file=.env.local examples/analysis-evaluation/run.mjs --anthropic YOUR_EXPLICIT_MODEL
```

Codex uses the operator's existing CLI login, fresh ephemeral contexts, no user
config/rules, disabled shell/web tools, no MCP server, a read-only workspace and a
minimal environment. Completed traces reject tool events. Credentials are never
copied into the workspace/container. Anthropic uses a current operator credential
with automatic retries disabled. No public listing or real catalog is written.
Both transports time out at 120 seconds and stop the batch on a transport failure.

Prompt, source and schema match across transports. Runtime conditions differ:
Codex uses low reasoning and has no equivalent CLI output-token cap; Anthropic
uses medium effort and 4,000 output tokens. Codex account usage is not an API
dollar estimate. Reports record these differences, request hashes, exact selected
model, latency, provider usage, structural rejection and expected selection.

Outputs/results remain in a private ignored `artifacts/analysis-evaluation-*`
directory. Review every explanation against the supplied references and the frozen
review points. Structural validity and control selection do not establish semantic
quality. Record material omissions and unsupported claims before selecting a
provider; preserve failures. Fresh-consumer checks apply only to reviewed authored
adaptations, never arbitrary upstream code.

The [official Codex CLI documentation](https://learn.chatgpt.com/docs/non-interactive-mode)
describes noninteractive structured output. This operator evaluation is separate
from a hosted multi-user integration.

The dated [results.json](results.json) records the first run: four Codex controls
passed structural/selection checks and implementing-agent source review, with
zero tool events. The Anthropic batch stopped on HTTP 401 before a generation
response. A successful second-provider run and real-repository holdouts remain
necessary before making a comparative quality claim.
