/** Explicit operator use of an existing ChatGPT account; never run by CI. */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { loadSuite, root, sha256 } from "./suite.mjs";
import { inspectTrace, scoreCase } from "./score.mjs";
import { tools } from "../discovery-evaluation/trace.mjs";
const [mode, origin, model, effort] = process.argv.slice(2);
if (
  mode !== "--run" ||
  process.argv.length !== 6 ||
  !/^http:\/\/127\.0\.0\.1:\d+$/.test(origin) ||
  origin.endsWith(":3187") ||
  !model ||
  !["low", "medium", "high"].includes(effort)
)
  throw Error(
    "Explicit account use: --run EVALUATION_LOOPBACK_ORIGIN MODEL low|medium|high",
  );
const { suite, controls, catalog, seal, sealBytes, archiveBytes } =
  await loadSuite({ archive: true });
const catalogRead = async () => {
  const r = await fetch(origin + "/api/v2/parts?limit=50", {
    redirect: "error",
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) throw Error("Catalog unavailable.");
  if (JSON.stringify(await r.json()) !== JSON.stringify(catalog))
    throw Error("Catalog changed during trial.");
};
await catalogRead();
const env = Object.fromEntries(
  ["PATH", "HOME", "TMPDIR", "CODEX_HOME"]
    .filter((k) => process.env[k])
    .map((k) => [k, process.env[k]]),
);
const auth = spawnSync("codex", ["login", "status"], {
  env,
  encoding: "utf8",
  timeout: 5000,
});
if (
  auth.status !== 0 ||
  !(auth.stdout + auth.stderr).includes("Logged in using ChatGPT")
)
  throw Error("Existing ChatGPT login required; no API keys are copied.");
const workspace = await fs.mkdtemp(
  path.join(os.tmpdir(), "salvage-competing-host-"),
);
await fs.chmod(workspace, 0o700);
const output = path.join(
  root,
  "artifacts",
  "competing-discovery-" + randomUUID(),
);
await fs.mkdir(output, { mode: 0o700 });
const results = [];
try {
  await fs.writeFile(path.join(workspace, "mcp.tgz"), archiveBytes);
  const install = spawnSync(
    "npm",
    [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--package-lock=false",
      "./mcp.tgz",
    ],
    { cwd: workspace, env, encoding: "utf8", timeout: 60000 },
  );
  if (install.status !== 0) throw Error("Isolated MCP installation failed.");
  const schema = path.join(workspace, "output-schema.json");
  await fs.writeFile(
    schema,
    JSON.stringify({
      type: "object",
      properties: { answer: { type: "string" }, finding: { type: "string" } },
      required: ["answer", "finding"],
      additionalProperties: false,
    }),
  );
  const entry = path.join(
    workspace,
    "node_modules/@repo-salvage/mcp/dist/index.js",
  );
  const config = `mcp_servers.repo_salvage={command=${JSON.stringify(process.execPath)},args=[${JSON.stringify(entry)},"--base",${JSON.stringify(origin)}],required=true,tool_timeout_sec=60,enabled_tools=${JSON.stringify(tools)},default_tools_approval_mode="auto"}`;
  const cliVersion = spawnSync("codex", ["--version"], {
    env,
    encoding: "utf8",
    timeout: 5000,
  }).stdout.trim();
  console.log(
    JSON.stringify({
      output,
      model,
      effort,
      cliVersion,
      cases: suite.cases.length,
    }),
  );
  for (const c of suite.cases) {
    const prefix = path.join(output, c.id),
      started = Date.now();
    const log = await fs.open(prefix + ".events.jsonl", "wx", 0o600),
      diagnostic = await fs.open(prefix + ".stderr.txt", "wx", 0o600);
    const prompt = suite.instructions + "\n\n" + c.question;
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
        `model_reasoning_effort="${effort}"`,
        "-c",
        config,
        "--cd",
        workspace,
        "--output-schema",
        schema,
        "--output-last-message",
        prefix + ".answer.json",
        "-",
      ],
      { cwd: workspace, env, stdio: ["pipe", log.fd, diagnostic.fd] },
    );
    child.stdin.on("error", () => {});
    child.stdin.end(prompt);
    let timedOut = false,
      grace;
    const stop = () => {
      timedOut = true;
      child.kill("SIGTERM");
      grace ??= setTimeout(() => child.kill("SIGKILL"), 5000);
    };
    const timer = setTimeout(stop, 240000);
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
    const code = await new Promise((resolve) => {
      child.once("error", () => resolve(null));
      child.once("exit", resolve);
    });
    clearTimeout(timer);
    clearTimeout(grace);
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
    await log.close();
    await diagnostic.close();
    const raw = await fs.readFile(prefix + ".events.jsonl", "utf8"),
      trace = inspectTrace(raw, code, timedOut);
    let answer = null;
    try {
      await fs.chmod(prefix + ".answer.json", 0o600);
      answer = JSON.parse(await fs.readFile(prefix + ".answer.json", "utf8"));
    } catch {}
    const score = scoreCase(answer, trace, c, controls);
    results.push({
      id: c.id,
      promptSha256: sha256(prompt),
      answer,
      expected: c.expectedAnswer,
      score,
      transportSuccess: trace.transportSuccess,
      failure: trace.failure,
      prohibited: trace.prohibited,
      usage: trace.usage,
      latencyMs: Date.now() - started,
      trace: { sha256: sha256(raw) },
      calls: trace.calls.map(
        ({ tool, arguments: args, status, error, result }) => ({
          tool,
          arguments: args,
          status,
          error: error ?? null,
          isError: result?.is_error ?? result?.isError ?? false,
        }),
      ),
    });
    await fs.writeFile(
      path.join(output, "results.json"),
      JSON.stringify(
        {
          format: suite.format,
          scope: suite.scope,
          model,
          effort,
          cliVersion,
          suiteSealSha256: sha256(sealBytes),
          archiveSha256: seal.archiveSha256,
          catalogRevision: catalog.catalog_revision,
          billing: "Existing Codex account allowance; no API-key model calls",
          results,
        },
        null,
        2,
      ) + "\n",
      { mode: 0o600 },
    );
    console.log(
      JSON.stringify({
        id: c.id,
        passed: score.passed,
        exactAnswer: score.exactAnswer,
        sourceEvidence: score.sourceEvidence,
        noticeEvidence: score.noticeEvidence,
        calls: trace.calls.length,
        failure: trace.failure,
      }),
    );
    if (!trace.transportSuccess) break;
  }
  await catalogRead();
  if (
    results.length !== suite.cases.length ||
    results.some((r) => !r.score.passed)
  )
    process.exitCode = 1;
} finally {
  await fs.rm(workspace, { recursive: true, force: true });
}
