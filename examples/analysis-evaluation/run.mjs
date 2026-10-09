/** Explicit operator model use. CI runs only frozen-request checks. */
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHash, randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import Anthropic from "@anthropic-ai/sdk";
import { root, loadEngine } from "./engine.mjs";
const [provider, model] = process.argv.slice(2);
if (
  !["--codex", "--anthropic"].includes(provider) ||
  !model ||
  process.argv.length !== 4
) {
  console.log(
    "Explicit model use: node examples/analysis-evaluation/run.mjs --codex MODEL\nOr: node --env-file=.env.local examples/analysis-evaluation/run.mjs --anthropic MODEL\nNo automatic retries; results remain under ignored artifacts.",
  );
  process.exit(process.argv.length > 2 ? 1 : 0);
}
if (provider === "--anthropic" && !process.env.ANTHROPIC_API_KEY)
  throw Error("Anthropic credential is not configured.");
process.chdir(root);
const frozen = JSON.parse(
  await fs.readFile(
    path.join(root, "examples/analysis-evaluation/packets.json"),
    "utf8",
  ),
);
const engine = await loadEngine();
const workspace = await fs.mkdtemp(
  path.join(os.tmpdir(), "salvage-evidence-eval-"),
);
const directory = path.join(
  root,
  "artifacts",
  "analysis-evaluation-" + randomUUID(),
);
await fs.mkdir(directory, { recursive: true, mode: 0o700 });
const results = [];
const cliVersion =
  provider === "--codex"
    ? spawnSync("codex", ["--version"], {
        encoding: "utf8",
        timeout: 5000,
      }).stdout.trim()
    : null;
try {
  for (const c of frozen.cases) {
    if (
      createHash("sha256").update(JSON.stringify(c.request)).digest("hex") !==
      c.requestSha256
    )
      throw Error("Frozen request hash mismatch.");
    const started = Date.now();
    const result = {
      id: c.id,
      provider,
      model,
      requestSha256: c.requestSha256,
      latencyMs: null,
      usage: null,
      requestId: null,
      transportSuccess: false,
      structurallyAccepted: false,
      selectionMatchesControl: false,
      semanticReview: "pending",
      failure: null,
    };
    let text;
    if (provider === "--codex") {
      const schema = path.join(workspace, "schema.json");
      await fs.writeFile(schema, JSON.stringify(c.request.schema));
      const output = path.join(directory, c.id + ".answer.json");
      const log = await fs.open(
        path.join(directory, c.id + ".events.jsonl"),
        "w",
        0o600,
      );
      const diagnostic = await fs.open(
        path.join(directory, c.id + ".stderr.txt"),
        "w",
        0o600,
      );
      const env = Object.fromEntries(
        ["PATH", "HOME", "TMPDIR", "CODEX_HOME"]
          .filter((k) => process.env[k])
          .map((k) => [k, process.env[k]]),
      );
      const child = spawn(
        "codex",
        [
          "exec",
          "--ephemeral",
          "--ignore-user-config",
          "--ignore-rules",
          "--skip-git-repo-check",
          "--sandbox",
          "read-only",
          "--model",
          model,
          "--json",
          "-c",
          'approval_policy="never"',
          "-c",
          "project_doc_max_bytes=0",
          "-c",
          'web_search="disabled"',
          "-c",
          "features.shell_tool=false",
          "-c",
          "features.unified_exec=false",
          "-c",
          'model_reasoning_effort="low"',
          "--cd",
          workspace,
          "--output-schema",
          schema,
          "--output-last-message",
          output,
          "-",
        ],
        { cwd: workspace, env, stdio: ["pipe", log.fd, diagnostic.fd] },
      );
      child.stdin.end(c.request.system + "\n\n" + c.request.input);
      const timer = setTimeout(() => child.kill("SIGTERM"), 120_000);
      const exit = await new Promise((resolve) => {
        child.once("error", () => resolve({ code: null }));
        child.once("exit", (code) => resolve({ code }));
      });
      clearTimeout(timer);
      await log.close();
      await diagnostic.close();
      const events = (
        await fs.readFile(path.join(directory, c.id + ".events.jsonl"), "utf8")
      )
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l));
      result.usage =
        events.find((e) => e.type === "turn.completed")?.usage ?? null;
      const prohibited = events
        .filter(
          (e) =>
            ["item.started", "item.updated", "item.completed"].includes(
              e.type,
            ) && !["agent_message", "reasoning"].includes(e.item?.type),
        )
        .map((e) => e.item?.type);
      result.prohibitedEvents = prohibited;
      result.transportSuccess = exit.code === 0 && prohibited.length === 0;
      result.failure = prohibited.length
        ? "prohibited_tool_event"
        : exit.code !== 0
          ? "cli_failed"
          : null;
      if (result.transportSuccess) text = await fs.readFile(output, "utf8");
    } else {
      try {
        const client = new Anthropic({
          timeout: 120_000,
          maxRetries: 0,
          ...(process.env.ANTHROPIC_WORKSPACE_ID
            ? {
                defaultHeaders: {
                  "anthropic-workspace-id": process.env.ANTHROPIC_WORKSPACE_ID,
                },
              }
            : {}),
        });
        const response = await client.messages.create({
          model,
          system: c.request.system,
          messages: [{ role: "user", content: c.request.input }],
          max_tokens: c.request.maxOutputTokens,
          output_config: {
            effort: "medium",
            format: { type: "json_schema", schema: c.request.schema },
          },
        });
        result.model = response.model;
        result.requestId = response._request_id;
        result.usage = response.usage;
        result.transportSuccess = !["max_tokens", "refusal"].includes(
          response.stop_reason,
        );
        if (result.transportSuccess)
          text = response.content
            .filter((x) => x.type === "text")
            .map((x) => x.text)
            .join("\n");
        else result.failure = response.stop_reason;
      } catch (error) {
        result.failure =
          "provider_http_" +
          (Number.isInteger(error.status) ? error.status : "unknown");
      }
      if (text)
        await fs.writeFile(path.join(directory, c.id + ".answer.json"), text, {
          mode: 0o600,
        });
    }
    result.latencyMs = Date.now() - started;
    if (text) {
      try {
        const summary = engine.verifiedIndexedSummary(text, c.index, c.packet);
        result.structurallyAccepted = true;
        const response = JSON.parse(text);
        result.selectionMatchesControl =
          response.outcome === c.expectedOutcome &&
          summary.reusable_pieces.every((p) =>
            c.allowedSymbols.includes(p.source_target.symbol),
          );
      } catch {
        result.failure = "response_validation_failed";
      }
    }
    results.push(result);
    await fs.writeFile(
      path.join(directory, "results.json"),
      JSON.stringify(
        {
          format: frozen.format,
          scope: frozen.scope,
          model,
          provider,
          cliVersion,
          transportLimits:
            provider === "--codex"
              ? "120s; CLI has no equivalent 4000-output-token cap; low reasoning"
              : "120s; 4000 output tokens; medium effort",
          billing:
            provider === "--codex"
              ? "Existing Codex account allowance; no dollar comparison"
              : "Provider usage only; reconcile billing separately",
          results,
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
    console.log(JSON.stringify(result));
    if (!result.transportSuccess) break;
  }
  console.log(
    JSON.stringify({ resultsFile: path.join(directory, "results.json") }),
  );
  if (
    results.some(
      (r) =>
        !r.transportSuccess ||
        !r.structurallyAccepted ||
        !r.selectionMatchesControl,
    )
  )
    process.exitCode = 1;
} finally {
  await engine.close();
  await fs.rm(workspace, { recursive: true, force: true });
}
