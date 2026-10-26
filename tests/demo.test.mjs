import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { demoEnvironment, demoPort } from "../scripts/demo-config.mjs";

test("local demo isolates existing credentials, data and paid work", () => {
  const parent = {
    PATH: "fixture-path",
    AUTH_SECRET: "existing-secret",
    AUTH_URL: "https://production.test",
    AUTH_GITHUB_ID: "existing-id",
    AUTH_GITHUB_SECRET: "existing-oauth",
    ANTHROPIC_API_KEY: "existing-provider",
    REPO_SALVAGE_TOKEN: "existing-agent",
    DATABASE_PATH: "existing-vault.db",
    ANALYSIS_WORKER_ENABLED: "1",
    GLOBAL_DAILY_SUMMARY_LIMIT: "100",
    MODERATOR_GITHUB_IDS: "42",
  };
  const env = demoEnvironment(
    parent,
    "/temporary-demo",
    "new-demo-secret",
    "3187",
  );
  assert.equal(env.AUTH_URL, "http://127.0.0.1:3187");
  assert.equal(env.HOSTNAME, "127.0.0.1");
  assert.equal(env.PORT, "3187");
  assert.equal(env.AUTH_SECRET, "new-demo-secret");
  assert.equal(env.DATABASE_PATH, path.join("/temporary-demo", "demo.db"));
  for (const key of [
    "AUTH_GITHUB_ID",
    "AUTH_GITHUB_SECRET",
    "ANTHROPIC_API_KEY",
    "REPO_SALVAGE_TOKEN",
    "MODERATOR_GITHUB_IDS",
  ])
    assert.equal(env[key], "");
  for (const key of [
    "ANALYSIS_WORKER_ENABLED",
    "GLOBAL_DAILY_SUMMARY_LIMIT",
    "DAILY_SUMMARY_LIMIT",
  ])
    assert.equal(env[key], "0");
  assert.equal(env.REPO_SALVAGE_DEMO, "1");
  assert.equal(env.PATH, parent.PATH);
  assert.equal(parent.AUTH_SECRET, "existing-secret");
  assert.equal(parent.DATABASE_PATH, "existing-vault.db");
});

test("demo rejects invalid ports before starting a server", () => {
  assert.equal(demoPort(), "3187");
  assert.equal(demoPort("04356"), "4356");
  for (const value of [
    "0",
    "65536",
    "-1",
    "3.5",
    "",
    "3000 --hostname 0.0.0.0",
  ])
    assert.throws(() => demoPort(value));
});

for (const signal of ["SIGINT", "SIGTERM"])
  test(
    `${signal} stops the demo builder launched by npm`,
    {
      skip: process.platform === "win32",
      timeout: 10000,
    },
    async (t) => {
      const root = await fs.mkdtemp(
        path.join(os.tmpdir(), "salvage-demo-stop-"),
      );
      await fs.mkdir(path.join(root, "scripts"));
      for (const file of ["demo.mjs", "demo-config.mjs"])
        await fs.copyFile(
          path.resolve("scripts", file),
          path.join(root, "scripts", file),
        );
      const launcher = path.join(root, "fixture-npm.mjs");
      await fs.writeFile(
        launcher,
        `
    import { spawn } from "node:child_process";
    spawn(process.execPath, ["-e", 'console.log("BUILDER_READY:" + process.pid); setInterval(() => {}, 1000);'], { stdio: "inherit" });
    setInterval(() => {}, 1000);
  `,
      );
      const demo = spawn(
        process.execPath,
        [path.join(root, "scripts/demo.mjs"), "--build"],
        {
          env: { ...process.env, npm_execpath: launcher },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      const closed = once(demo, "close");
      let builderPid;
      t.after(async () => {
        demo.kill("SIGKILL");
        if (builderPid) {
          try {
            process.kill(builderPid, "SIGKILL");
          } catch (error) {
            if (error.code !== "ESRCH") throw error;
          }
        }
        await closed;
        await fs.rm(root, { recursive: true, force: true });
      });
      const output = await new Promise((resolve, reject) => {
        let stdout = "";
        demo.stdout.on("data", (chunk) => {
          stdout += chunk;
          const match = /BUILDER_READY:(\d+)/.exec(stdout);
          if (match) resolve(Number(match[1]));
        });
        demo.once("error", reject);
        demo.once("exit", () =>
          reject(new Error("Demo exited before its builder started.")),
        );
      });
      builderPid = output;
      demo.kill(signal);
      // An orphan builder keeps the inherited stdout pipe open. Waiting for close
      // checks the whole observable lifecycle rather than only the launcher exit.
      assert.equal((await closed)[0], 0);
      builderPid = undefined;
    },
  );
