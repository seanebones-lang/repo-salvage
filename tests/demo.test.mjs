import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
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
