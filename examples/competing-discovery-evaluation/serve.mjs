/** Operator-only isolated production server. Never writes the live database. */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
const root = path.resolve(import.meta.dirname, "../..");
if (process.argv.length !== 4 || process.argv[2] !== "--serve")
  throw Error(
    "Use --serve PORT after building; creates a disposable database.",
  );
const port = Number(process.argv[3]);
if (!Number.isSafeInteger(port) || port < 1024 || port > 65535 || port === 3187)
  throw Error(
    "Choose a separate unprivileged port, not the live preview port.",
  );
const directory = await fs.mkdtemp(
  path.join(os.tmpdir(), "salvage-competing-"),
);
await fs.chmod(directory, 0o700);
let child;
try {
  const runtime = path.join(directory, "app");
  await fs.cp(path.join(root, ".next/standalone"), runtime, {
    recursive: true,
    filter: (p) => !path.basename(p).startsWith(".env"),
  });
  await fs.cp(
    path.join(root, ".next/static"),
    path.join(runtime, ".next/static"),
    { recursive: true },
  );
  await fs.cp(path.join(root, "public"), path.join(runtime, "public"), {
    recursive: true,
  });
  const filename = path.join(directory, "evaluation.db");
  const db = new Database(filename);
  const rows = JSON.parse(
    await fs.readFile(new URL("./listings.json", import.meta.url), "utf8"),
  );
  const columns = Object.keys(rows[0]);
  if (columns.some((c) => !/^[a-z_]+$/.test(c)))
    throw Error("Invalid fixture columns.");
  db.exec(
    `CREATE TABLE listings (${columns.map((c) => `${c} ${["id", "github_repo_id", "owner_id", "stars", "forks", "used_count"].includes(c) ? "INTEGER" : "TEXT"}${c === "id" ? " PRIMARY KEY" : c === "github_repo_id" ? " UNIQUE" : ""}`).join(",")})`,
  );
  const insert = db.prepare(
    `INSERT INTO listings (${columns.join(",")}) VALUES (${columns.map((c) => "@" + c).join(",")})`,
  );
  db.transaction(() => rows.forEach((r) => insert.run(r)))();
  db.close();
  await fs.chmod(filename, 0o600);
  const env = Object.fromEntries(
    ["PATH", "HOME", "TMPDIR", "AUTH_GITHUB_ID", "AUTH_GITHUB_SECRET"]
      .filter((k) => process.env[k])
      .map((k) => [k, process.env[k]]),
  );
  Object.assign(env, {
    NODE_ENV: "production",
    HOSTNAME: "127.0.0.1",
    PORT: String(port),
    DATABASE_PATH: filename,
    AUTH_URL: `http://127.0.0.1:${port}`,
    AUTH_SECRET: randomUUID() + randomUUID(),
    ANALYSIS_WORKER_ENABLED: "1",
    GLOBAL_DAILY_SUMMARY_LIMIT: "0",
    DAILY_SUMMARY_LIMIT: "0",
    AGENT_READ_LIMIT: "1000",
  });
  child = spawn(process.execPath, ["server.js"], {
    cwd: runtime,
    env,
    stdio: "inherit",
  });
  const stop = () => child.kill("SIGTERM");
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  console.log(
    JSON.stringify({
      origin: env.AUTH_URL,
      scope:
        "Disposable evaluation DB; no provider credentials; analysis allowances zero",
      listings: rows.length,
    }),
  );
  process.exitCode = await new Promise((resolve, reject) => {
    child.once("exit", (code) => resolve(code ?? 1));
    child.once("error", reject);
  });
  process.removeListener("SIGINT", stop);
  process.removeListener("SIGTERM", stop);
} finally {
  if (child && child.exitCode === null) child.kill("SIGKILL");
  await fs.rm(directory, { recursive: true, force: true });
}
