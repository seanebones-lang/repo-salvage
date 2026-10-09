/** Independent installed-package proof, with offline pinned responses and no credentials. */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { serveFocusFixture } from "../examples/focused-evidence/fixture-server.mjs";
if (process.argv.length !== 3 || process.argv[2] !== "--run")
  throw Error("Run --run after npm run build has packaged the archives.");
const root = path.resolve(import.meta.dirname, "..");
const directory = await fs.mkdtemp(
  path.join(os.tmpdir(), "salvage-focus-packages-"),
);
const env = Object.fromEntries(
  ["PATH", "HOME", "TMPDIR", "SYSTEMROOT"]
    .filter((k) => process.env[k])
    .map((k) => [k, process.env[k]]),
);
const run = (command, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: directory,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let text = "",
      errors = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), 60000);
    child.stdout.on("data", (chunk) => {
      text += chunk;
      if (Buffer.byteLength(text) > 1_048_576) child.kill("SIGKILL");
    });
    child.stderr.on("data", (chunk) => {
      errors += chunk;
      if (Buffer.byteLength(errors) > 1_048_576) child.kill("SIGKILL");
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(text);
      else reject(Error("Independent consumer process failed: " + code));
    });
  });
const fixture = await serveFocusFixture({ includeBoundary: true });
const nativeFixture = await (
  await import("../examples/rust-go-consumers/fixture.mjs")
).serveFixture();
const fileFixture = await (
  await import("../examples/native-file-context/fixture.mjs")
).serveFixture();
let client, nativeClient, fileClient;
try {
  await run(process.platform === "win32" ? "npm.cmd" : "npm", [
    "install",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    "--package-lock=false",
    path.join(root, "public/repo-salvage-cli.tgz"),
    path.join(root, "public/repo-salvage-mcp.tgz"),
  ]);
  const cli = path.join(directory, "node_modules/@repo-salvage/cli");
  const mcp = path.join(directory, "node_modules/@repo-salvage/mcp");
  assert.equal(
    JSON.parse(await fs.readFile(path.join(cli, "package.json"), "utf8"))
      .version,
    "0.7.0",
  );
  assert.equal(
    JSON.parse(await fs.readFile(path.join(mcp, "package.json"), "utf8"))
      .version,
    "0.5.0",
  );
  for (const c of fixture.suite.cases) {
    const output = await run(process.execPath, [
      path.join(cli, "bin/repo-salvage.mjs"),
      "evidence",
      String(c.parameters.listing_id),
      "--base",
      fixture.origin,
      "--path",
      c.parameters.path,
      ...(c.parameters.symbol ? ["--symbol", c.parameters.symbol] : []),
      "--max-characters",
      "24000",
    ]);
    assert.deepEqual(JSON.parse(output), c.response);
  }
  client = new Client(
    { name: "independent-focus-host", version: "1.0.0" },
    { versionNegotiation: { mode: { pin: "2026-07-28" } } },
  );
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [path.join(mcp, "dist/index.js"), "--base", fixture.origin],
      cwd: directory,
      env,
      stderr: "pipe",
    }),
  );
  for (const c of fixture.suite.cases) {
    const result = await client.callTool({
      name: "repo_salvage_focus_evidence",
      arguments: c.parameters,
    });
    assert.ok(!result.isError);
    assert.deepEqual(result.structuredContent, c.response);
  }
  assert.equal(fixture.requests.length, 14);
  assert.ok(
    fixture.requests.every(
      (r) => r.method === "GET" && r.authorization === undefined,
    ),
  );
  nativeClient = new Client({
    name: "independent-native-focus-host",
    version: "1.0.0",
  });
  await nativeClient.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [path.join(mcp, "dist/index.js"), "--base", nativeFixture.origin],
      cwd: directory,
      env,
      stderr: "pipe",
    }),
  );
  for (const c of nativeFixture.cases) {
    const output = await run(process.execPath, [
      path.join(cli, "bin/repo-salvage.mjs"),
      "evidence",
      String(c.parameters.listing_id),
      "--base",
      nativeFixture.origin,
      "--path",
      c.parameters.path,
      "--symbol",
      c.parameters.symbol,
      "--max-characters",
      String(c.parameters.max_characters),
    ]);
    assert.deepEqual(JSON.parse(output), c.response);
    const result = await nativeClient.callTool({
      name: "repo_salvage_focus_evidence",
      arguments: c.parameters,
    });
    assert.ok(!result.isError);
    assert.deepEqual(result.structuredContent, c.response);
  }
  assert.equal(nativeFixture.requests.length, 4);
  assert.ok(
    nativeFixture.requests.every(
      (r) => r.method === "GET" && r.authorization === undefined,
    ),
  );
  fileClient = new Client({
    name: "independent-file-context-host",
    version: "1.0.0",
  });
  await fileClient.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [path.join(mcp, "dist/index.js"), "--base", fileFixture.origin],
      cwd: directory,
      env,
      stderr: "pipe",
    }),
  );
  for (const c of fileFixture.cases) {
    const output = await run(process.execPath, [
      path.join(cli, "bin/repo-salvage.mjs"),
      "evidence",
      String(c.parameters.listing_id),
      "--base",
      fileFixture.origin,
      "--path",
      c.parameters.path,
      "--symbol",
      c.parameters.symbol,
      "--max-characters",
      String(c.parameters.max_characters),
    ]);
    assert.deepEqual(JSON.parse(output), c.response);
    const result = await fileClient.callTool({
      name: "repo_salvage_focus_evidence",
      arguments: c.parameters,
    });
    assert.ok(!result.isError);
    assert.deepEqual(result.structuredContent, c.response);
  }
  assert.equal(fileFixture.requests.length, 10);
  assert.ok(
    fileFixture.requests.every(
      (r) => r.method === "GET" && r.authorization === undefined,
    ),
  );
  console.log(
    JSON.stringify({
      status: "passed",
      checks: 30,
      installedCli: "0.7.0",
      installedMcp: "0.5.0",
      realSourceCases: 11,
      authoredBoundaryCases: 3,
      requests: 28,
      providerCalls: 0,
      realCredentials: false,
      sourceExecuted: false,
    }),
  );
} finally {
  if (fileClient) await fileClient.close();
  await fileFixture.close();
  if (nativeClient) await nativeClient.close();
  await nativeFixture.close();
  if (client) await client.close();
  await fixture.close();
  await fs.rm(directory, { recursive: true, force: true });
}
