/** Build and exercise the demo and its downloaded adaptation outside the checkout. */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn, spawnSync } from "node:child_process";
import { gunzipSync } from "node:zlib";

const root = path.resolve(import.meta.dirname, "..");
const temp = await fs.mkdtemp(path.join(os.tmpdir(), "salvage-demo-smoke-"));
const socket = net.createServer();
await new Promise((resolve) => socket.listen(0, "127.0.0.1", resolve));
const port = socket.address().port;
await new Promise((resolve) => socket.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const child = spawn(
  process.execPath,
  [path.join(root, "scripts/demo.mjs"), "--build", "--port", String(port)],
  {
    cwd: temp,
    env: { ...process.env, TMPDIR: temp, TMP: temp, TEMP: temp },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
const exited = new Promise((resolve, reject) => {
  child.once("exit", resolve);
  child.once("error", reject);
});
let logs = "";
for (const stream of [child.stdout, child.stderr])
  stream.on("data", (chunk) => {
    logs = (logs + chunk).slice(-16000);
  });
async function get(route) {
  const response = await fetch(origin + route, {
    signal: AbortSignal.timeout(3000),
  });
  assert.equal(response.status, 200, route);
  return response;
}
try {
  let ready = false;
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw Error("Demo stopped before readiness.");
    try {
      const health = await (await get("/api/health")).json();
      assert.equal(health.database, "ready");
      assert.equal(health.worker, "disabled");
      ready = true;
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  assert.ok(ready, "Built demo readiness timed out.");
  assert.deepEqual(await (await get("/api/auth/providers")).json(), {});
  const examples = await (await get("/examples")).text();
  assert.ok(examples.includes("Evidence-bound summary parser"));
  assert.ok(examples.includes("Sign-in and paid analysis are disabled"));
  const catalog = await (await get("/api/v2/parts")).json();
  assert.equal(catalog.pagination.total, 0);
  const agents = await (await get("/agents")).text();
  assert.ok(agents.includes("Download the CLI"));
  for (const route of ["/repo-salvage-cli.tgz", "/repo-salvage-mcp.tgz"])
    assert.ok(Number((await get(route)).headers.get("content-length")) > 0);
  const bytes = gunzipSync(
    Buffer.from(await (await get("/summary-parser.tar.gz")).arrayBuffer()),
  );
  const allowed = new Set([
    "parser.mjs",
    "consumer.test.mjs",
    "package.json",
    "README.md",
    "LICENSE",
  ]);
  const consumer = path.join(temp, "consumer");
  await fs.mkdir(consumer);
  for (let offset = 0; offset < bytes.length && bytes[offset];) {
    const name = bytes
      .subarray(offset, offset + 100)
      .toString()
      .split("\0")[0];
    const size = parseInt(
      bytes.subarray(offset + 124, offset + 136).toString(),
      8,
    );
    const file = name.replace(/^summary-parser\//, "");
    assert.ok(name.startsWith("summary-parser/") && allowed.delete(file), name);
    assert.ok(Number.isSafeInteger(size) && size >= 0 && size < 100000);
    assert.equal(bytes[offset + 156], "0".charCodeAt(0));
    await fs.writeFile(
      path.join(consumer, file),
      bytes.subarray(offset + 512, offset + 512 + size),
    );
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  assert.equal(allowed.size, 0);
  const tested = spawnSync(process.execPath, ["--test", "consumer.test.mjs"], {
    cwd: consumer,
    encoding: "utf8",
    timeout: 10000,
  });
  assert.equal(tested.status, 0, tested.stdout + tested.stderr);
  console.log(
    "Built local demo passed: health, disabled OAuth/worker, empty catalog, examples, agent downloads, and downloaded parser consumer tests outside the checkout.",
  );
} catch (error) {
  console.error(logs);
  throw error;
} finally {
  child.kill("SIGTERM");
  const timeout = setTimeout(() => child.kill("SIGKILL"), 10000);
  await exited;
  clearTimeout(timeout);
  assert.ok(
    !(await fs.readdir(temp)).some((name) =>
      name.startsWith("repo-salvage-demo-"),
    ),
    "Demo database cleanup failed.",
  );
  await fs.rm(temp, { recursive: true, force: true });
}
