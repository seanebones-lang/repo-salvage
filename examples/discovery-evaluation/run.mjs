/** Operator-only model trial. Never invoked by CI; expected answers stay outside host workspace. */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { baseUrl } from "../../packages/cli/lib/client.mjs";
import { inspectTrace, scoreDiscovery, tools } from "./trace.mjs";
const root = path.resolve(import.meta.dirname, "../..");
const directory = path.join(root, "examples/discovery-evaluation");
const hash = (b) => createHash("sha256").update(b).digest("hex");
const [mode, rawOrigin, model, effort] = process.argv.slice(2);
if (
  !["--run", "--run-adaptation"].includes(mode) ||
  !rawOrigin ||
  !model ||
  !["low", "medium", "high"].includes(effort) ||
  process.argv.length !== 6
)
  throw Error(
    "Explicit account use: node examples/discovery-evaluation/run.mjs --run|--run-adaptation ORIGIN MODEL low|medium|high",
  );
const origin = baseUrl(rawOrigin);
const [suiteBytes, catalogBytes, sealBytes, archive, controlBytes] =
  await Promise.all([
    fs.readFile(path.join(directory, "cases.json")),
    fs.readFile(path.join(directory, "catalog.json")),
    fs.readFile(path.join(directory, "seal.json")),
    fs.readFile(path.join(root, "public/repo-salvage-mcp.tgz")),
    fs.readFile(path.join(directory, "controls.json")),
  ]);
const suite = JSON.parse(suiteBytes),
  catalog = JSON.parse(catalogBytes),
  seal = JSON.parse(sealBytes);
const adaptation = mode === "--run-adaptation";
let adaptationTask = "";
if (adaptation) {
  adaptationTask = await fs.readFile(
    path.join(directory, "adaptation-task.md"),
    "utf8",
  );
  const taskSeal = JSON.parse(
    await fs.readFile(path.join(directory, "adaptation-seal.json"), "utf8"),
  );
  if (hash(adaptationTask) !== taskSeal.taskSha256)
    throw Error("Adaptation task changed after freeze.");
  if (
    hash(
      await fs.readFile(
        path.join(root, "examples/prose-consumer/test_prose.py"),
      ),
    ) !== taskSeal.consumerTestsSha256
  )
    throw Error("Consumer acceptance checks changed after freeze.");
}
const trials = adaptation
  ? suite.cases.filter((c) => c.id === "bounded-prose-chunks")
  : suite.cases;
if (
  hash(suiteBytes) !== seal.casesSha256 ||
  hash(catalogBytes) !== seal.catalogSha256 ||
  hash(archive) !== seal.archiveSha256 ||
  hash(controlBytes) !== seal.controlsSha256 ||
  suite.cases.length !== 10
)
  throw Error(
    "Frozen suite/archive mismatch before model use. Preserve an evaluated epoch.",
  );
const catalogRead = async () => {
  const response = await fetch(origin + "/api/v2/parts?limit=50", {
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw Error("Public catalog verification failed before/after trial.");
  return response.json();
};
const current = await catalogRead();
if (JSON.stringify(current) !== JSON.stringify(catalog))
  throw Error("Catalog changed before trial.");
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
  throw Error(
    "An existing ChatGPT login is required; no credentials are copied.",
  );
const workspace = await fs.mkdtemp(
  path.join(os.tmpdir(), "salvage-discovery-host-"),
);
const output = path.join(root, "artifacts", "discovery-" + randomUUID());
await fs.mkdir(output, { mode: 0o700 });
await fs.writeFile(path.join(workspace, "mcp.tgz"), archive);
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
if (install.status !== 0) {
  await fs.rm(workspace, { recursive: true, force: true });
  throw Error("Clean MCP package installation failed.");
}
const schema = path.join(workspace, "output-schema.json");
await fs.writeFile(
  schema,
  JSON.stringify({
    type: "object",
    properties: {
      answer: { type: "string" },
      finding: { type: "string" },
      ...(adaptation ? { code: { type: "string" } } : {}),
    },
    required: ["answer", "finding", ...(adaptation ? ["code"] : [])],
    additionalProperties: false,
  }),
);
const entry = path.join(
  workspace,
  "node_modules/@repo-salvage/mcp/dist/index.js",
);
const config = `mcp_servers.repo_salvage={command=${JSON.stringify(process.execPath)},args=[${JSON.stringify(entry)},"--base",${JSON.stringify(origin)}],required=true,tool_timeout_sec=60,enabled_tools=${JSON.stringify(tools)},default_tools_approval_mode="auto"}`;
const results = [];
const cliVersion = spawnSync("codex", ["--version"], {
  env,
  encoding: "utf8",
}).stdout.trim();
console.log(
  JSON.stringify({
    output,
    model,
    effort,
    cliVersion,
    cases: trials.length,
    mode,
  }),
);
try {
  for (const c of trials) {
    const prefix = path.join(output, c.id),
      started = Date.now();
    const log = await fs.open(prefix + ".events.jsonl", "w", 0o600),
      diagnostic = await fs.open(prefix + ".stderr.txt", "w", 0o600);
    const prompt =
      suite.instructions +
      "\n\n" +
      c.question +
      (adaptation ? "\n\n" + adaptationTask : "");
    const args = [
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
    ];
    const child = spawn("codex", args, {
      cwd: workspace,
      env,
      stdio: ["pipe", log.fd, diagnostic.fd],
    });
    child.stdin.on("error", () => {});
    child.stdin.end(prompt);
    let timedOut = false,
      killTimer;
    const stop = () => {
      timedOut = true;
      child.kill("SIGTERM");
      killTimer = setTimeout(() => child.kill("SIGKILL"), 5000);
    };
    const timer = setTimeout(stop, 180000);
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
    const code = await new Promise((resolve) => {
      child.once("error", () => resolve(null));
      child.once("exit", resolve);
    });
    clearTimeout(timer);
    clearTimeout(killTimer);
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
    await log.close();
    await diagnostic.close();
    const raw = await fs.readFile(prefix + ".events.jsonl", "utf8");
    const trace = inspectTrace(raw, code, timedOut);
    let answer = null;
    try {
      answer = JSON.parse(await fs.readFile(prefix + ".answer.json", "utf8"));
      await fs.chmod(prefix + ".answer.json", 0o600);
    } catch {}
    const score = scoreDiscovery(answer, trace, c.expectedAnswer);
    results.push({
      id: c.id,
      promptSha256: hash(prompt),
      answer,
      expected: c.expectedAnswer,
      score,
      transportSuccess: trace.transportSuccess,
      failure: trace.failure,
      prohibited: trace.prohibited,
      usage: trace.usage,
      latencyMs: Date.now() - started,
      calls: trace.calls.map(
        ({ tool, arguments: arguments_, status, error, result }) => ({
          tool,
          arguments: arguments_,
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
          mode,
          scope: suite.scope,
          origin,
          model,
          effort,
          cliVersion,
          suiteSealSha256: hash(sealBytes),
          archiveSha256: hash(archive),
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
        ...score,
        calls: trace.calls.length,
        failure: trace.failure,
      }),
    );
    if (!trace.transportSuccess) break;
  }
  const after = await catalogRead();
  if (JSON.stringify(after) !== JSON.stringify(catalog))
    throw Error("Catalog changed during trial; results require review.");
  if (results.length !== trials.length || results.some((r) => !r.score.passed))
    process.exitCode = 1;
} finally {
  await fs.rm(workspace, { recursive: true, force: true });
}
