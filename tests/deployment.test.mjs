import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import Database from "better-sqlite3";
import { containerConfig } from "../scripts/container-config.mjs";
import { backupDatabase } from "../scripts/backup-db.mjs";
const valid = {
  AUTH_SECRET: "fixture-".repeat(5),
  AUTH_URL: "https://salvage.example.test",
};
test("container requires a canonical secure origin and a strong configured secret", () => {
  assert.equal(containerConfig(valid).origin, valid.AUTH_URL);
  for (const url of [
    undefined,
    "http://example.test",
    "https://a:b@example.test",
    "https://example.test/path",
    "https://example.test/?token=secret",
    "https://example.test/#secret",
  ])
    assert.throws(() => containerConfig({ ...valid, AUTH_URL: url }));
  for (const secret of [undefined, "", "too-short", " ".repeat(32)])
    assert.throws(() => containerConfig({ ...valid, AUTH_SECRET: secret }));
  for (const url of [
    "http://localhost:3000",
    "http://127.0.0.1:3189",
    "http://[::1]:3000",
  ])
    assert.equal(containerConfig({ ...valid, AUTH_URL: url }).origin, url);
});
test("container rejects partial OAuth and invalid ports, paths and allowance values", () => {
  for (const env of [
    { AUTH_GITHUB_ID: "fixture" },
    { AUTH_GITHUB_SECRET: "fixture" },
    { PORT: "0" },
    { PORT: "65536" },
    { PORT: "3.5" },
    { DATABASE_PATH: "./ephemeral.db" },
    { AGENT_READ_LIMIT: "-1" },
    { GLOBAL_DAILY_SUMMARY_LIMIT: "garbage" },
    { DAILY_SUMMARY_LIMIT: "Infinity" },
    { ANALYSIS_WORKER_ENABLED: "yes" },
  ])
    assert.throws(() => containerConfig({ ...valid, ...env }));
  assert.equal(
    containerConfig({ ...valid, PORT: "8080", GLOBAL_DAILY_SUMMARY_LIMIT: "0" })
      .port,
    "8080",
  );
  for (const value of ["0", "1"])
    assert.ok(containerConfig({ ...valid, ANALYSIS_WORKER_ENABLED: value }));
});
test("paid container operation requires a moderator; a disabled analysis pilot can start", () => {
  assert.throws(() =>
    containerConfig({ ...valid, ANTHROPIC_API_KEY: "fixture-key" }),
  );
  for (const ids of ["0", "abc", "123,", "-1", "1.5"])
    assert.throws(() =>
      containerConfig({ ...valid, MODERATOR_GITHUB_IDS: ids }),
    );
  assert.ok(
    containerConfig({
      ...valid,
      ANTHROPIC_API_KEY: "fixture-key",
      MODERATOR_GITHUB_IDS: "123, 456",
    }),
  );
  assert.ok(
    containerConfig({
      ...valid,
      ANTHROPIC_API_KEY: "fixture-key",
      GLOBAL_DAILY_SUMMARY_LIMIT: "0",
    }),
  );
});
test("online backup retains committed WAL data and restores independently with private permissions", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "salvage-backup-"));
  const source = path.join(directory, "live.db"),
    target = path.join(directory, "backup.db");
  const writer = new Database(source);
  try {
    writer.pragma("journal_mode = WAL");
    writer.pragma("wal_autocheckpoint = 0");
    writer.exec(
      "CREATE TABLE evidence (id INTEGER PRIMARY KEY, value TEXT); INSERT INTO evidence VALUES (1, 'committed'); BEGIN IMMEDIATE; INSERT INTO evidence VALUES (2, 'uncommitted')",
    );
    const result = await backupDatabase(source, target);
    assert.equal(result.status, "ok");
    assert.ok(result.bytes > 0);
    const copy = new Database(target, { readonly: true });
    try {
      assert.deepEqual(copy.prepare("SELECT * FROM evidence").all(), [
        { id: 1, value: "committed" },
      ]);
    } finally {
      copy.close();
    }
    assert.equal((await fs.stat(target)).mode & 0o777, 0o600);
    writer.exec("ROLLBACK");
  } finally {
    writer.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
test("backup refuses existing files and leaves the previous backup unchanged", async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "salvage-backup-existing-"),
  );
  const source = path.join(directory, "live.db"),
    target = path.join(directory, "existing.db");
  const db = new Database(source);
  db.exec("CREATE TABLE evidence (id INTEGER)");
  db.close();
  await fs.writeFile(target, "previous copy");
  try {
    await assert.rejects(backupDatabase(source, target));
    assert.equal(await fs.readFile(target, "utf8"), "previous copy");
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
test("backup rejects missing or corrupt input without creating a usable output", async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "salvage-backup-invalid-"),
  );
  try {
    await fs.writeFile(path.join(directory, "corrupt.db"), "not a database");
    for (const source of ["missing.db", "corrupt.db"]) {
      await assert.rejects(
        backupDatabase(
          path.join(directory, source),
          path.join(directory, "output.db"),
        ),
      );
      await assert.rejects(fs.stat(path.join(directory, "output.db")));
    }
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
test("backup CLI works from a path containing spaces and returns bounded metadata", async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "salvage backup cli "),
  );
  const source = path.join(directory, "source.db"),
    target = path.join(directory, "copy.db");
  const db = new Database(source);
  db.exec("CREATE TABLE evidence (id INTEGER)");
  db.close();
  try {
    const run = spawnSync(
      process.execPath,
      [path.resolve("scripts/backup-db.mjs"), target],
      {
        env: { ...process.env, DATABASE_PATH: source },
        encoding: "utf8",
        timeout: 10000,
      },
    );
    assert.equal(run.status, 0, run.stderr);
    assert.equal(JSON.parse(run.stdout).status, "ok");
    assert.equal(Object.keys(JSON.parse(run.stdout)).length, 2);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
test("backup rejects publicly served destinations", async () => {
  for (const output of ["public/private.db", ".next/static/private.db"])
    await assert.rejects(
      backupDatabase("does-not-exist.db", output),
      /outside public/,
    );
});
test("backup rejects a directory symlink into public assets", async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "salvage-backup-link-"),
  );
  try {
    await fs.symlink(
      path.resolve("public"),
      path.join(directory, "alias"),
      "dir",
    );
    await assert.rejects(
      backupDatabase(
        "does-not-exist.db",
        path.join(directory, "alias", "private.db"),
      ),
      /outside public/,
    );
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
