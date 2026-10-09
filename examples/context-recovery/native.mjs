/** Native product-evaluation host derived from the frozen full-chain harness; no API keys. */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { root } from "../analysis-evaluation/engine.mjs";
import { inspectCodexTrace } from "../analysis-evaluation/trace.mjs";
import { inspectTrace } from "../discovery-evaluation/trace.mjs";
import { read, sha as sha256 } from "./suite.mjs";
const tools = ["repo_salvage_focus_evidence"];
export async function nativeRun({ model, effort, prompt, schema, origin }) {
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
    throw Error("Existing ChatGPT login required.");
  const workspace = await fs.mkdtemp(
    path.join(os.tmpdir(), "salvage-chain-host-"),
  );
  await fs.chmod(workspace, 0o700);
  const output = path.join(
    root,
    "artifacts",
    "context-recovery-" + randomUUID(),
  );
  await fs.mkdir(output, { mode: 0o700 });
  let log, diagnostic;
  try {
    await fs.writeFile(
      path.join(workspace, "schema.json"),
      JSON.stringify(schema),
    );
    let config = [];
    if (origin) {
      const archive = await fs.readFile(
        path.join(root, "public/repo-salvage-mcp.tgz"),
      );
      const seal = await read("input-seal.json");
      if (sha256(archive) !== seal.archiveSha256)
        throw Error("MCP archive changed.");
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
      if (install.status !== 0) throw Error("Clean MCP installation failed.");
      const entry = path.join(
        workspace,
        "node_modules/@repo-salvage/mcp/dist/index.js",
      );
      config = [
        "-c",
        `mcp_servers.repo_salvage={command=${JSON.stringify(process.execPath)},args=[${JSON.stringify(entry)},"--base",${JSON.stringify(origin)}],required=true,tool_timeout_sec=60,enabled_tools=${JSON.stringify(tools)},default_tools_approval_mode="auto"}`,
      ];
    }
    log = await fs.open(path.join(output, "events.jsonl"), "wx", 0o600);
    diagnostic = await fs.open(path.join(output, "stderr.txt"), "wx", 0o600);
    const started = Date.now();
    const answerPath = path.join(output, "answer.json");
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
        ...config,
        "--cd",
        workspace,
        "--output-schema",
        path.join(workspace, "schema.json"),
        "--output-last-message",
        answerPath,
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
    log = null;
    await diagnostic.close();
    diagnostic = null;
    const raw = await fs.readFile(path.join(output, "events.jsonl"), "utf8");
    let answer = null;
    try {
      await fs.chmod(answerPath, 0o600);
      answer = JSON.parse(await fs.readFile(answerPath, "utf8"));
    } catch {}
    return {
      output,
      raw,
      answer,
      trace: origin
        ? inspectTrace(raw, code, timedOut)
        : inspectCodexTrace(raw, code, timedOut),
      record: {
        model,
        effort,
        cliVersion: spawnSync("codex", ["--version"], {
          env,
          encoding: "utf8",
          timeout: 5000,
        }).stdout.trim(),
        promptSha256: sha256(prompt),
        trace: { sha256: sha256(raw) },
        latencyMs: Date.now() - started,
        billing: "Existing Codex account allowance; no API-key model call",
      },
    };
  } finally {
    await log?.close();
    await diagnostic?.close();
    await fs.rm(workspace, { recursive: true, force: true });
  }
}
