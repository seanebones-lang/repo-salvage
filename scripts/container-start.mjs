import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import Database from "better-sqlite3";
import { containerConfig } from "./container-config.mjs";

try {
  const config = containerConfig(process.env);
  const directory = path.dirname(config.database);
  // A writable image directory is still ephemeral. Require a separately mounted
  // non-memory filesystem for the database directory (or an ancestor below /).
  const mounted = fs
    .readFileSync("/proc/self/mountinfo", "utf8")
    .split("\n")
    .some((line) => {
      const fields = line.split(" ");
      const mount = fields[4]?.replace(/\\([0-7]{3})/g, (_, octal) =>
        String.fromCharCode(parseInt(octal, 8)),
      );
      const type = fields[fields.indexOf("-") + 1];
      return (
        mount &&
        mount !== "/" &&
        !["tmpfs", "ramfs"].includes(type) &&
        (directory === mount || directory.startsWith(mount + path.sep))
      );
    });
  if (!mounted)
    throw new Error(
      "The database requires a mounted persistent data directory.",
    );
  // Some providers mount volumes owned by root. Only an explicitly root-started
  // container repairs the dedicated default mount, then drops privileges BEFORE
  // opening SQLite or loading the application. The image defaults to USER node.
  if (process.getuid() === 0) {
    if (directory !== "/app/data")
      throw new Error(
        "Root volume initialization supports only /app/data; initialize custom mounts separately.",
      );
    fs.mkdirSync(directory, { recursive: true });
    for (const file of [
      directory,
      config.database,
      config.database + "-wal",
      config.database + "-shm",
    ]) {
      const info = fs.lstatSync(file, { throwIfNoEntry: false });
      if (!info) continue;
      if (info.isSymbolicLink())
        throw new Error(
          "Refusing a symlink in the volume ownership initialization.",
        );
      fs.chownSync(file, 1000, 1000);
    }
    process.setgroups([1000]);
    process.setgid(1000);
    process.setuid(1000);
  }
  if (process.getuid() === 0)
    throw new Error("Application must run unprivileged.");
  fs.mkdirSync(directory, { recursive: true });
  const probe = path.join(directory, `.startup-${randomUUID()}`);
  const fd = fs.openSync(probe, "wx", 0o600);
  fs.closeSync(fd);
  fs.unlinkSync(probe);
  if (fs.existsSync(config.database))
    fs.accessSync(config.database, fs.constants.R_OK | fs.constants.W_OK);
  const database = new Database(config.database);
  try {
    if (database.pragma("quick_check", { simple: true }) !== "ok")
      throw new Error("Database integrity check failed.");
    database.pragma("journal_mode = WAL");
  } finally {
    database.close();
  }
  process.env.AUTH_URL = config.origin;
  process.env.PORT = config.port;
  process.env.DATABASE_PATH = config.database;
  console.log(
    JSON.stringify({
      event: "container_ready",
      uid: process.getuid(),
      database: "writable",
      integrity: "ok",
    }),
  );
} catch {
  // Configuration/filesystem exception messages can contain input values.
  // Fail before listening without reflecting credentials or private data.
  console.error(
    "Container preflight failed. Check canonical origin, auth secret, paired OAuth credentials, numeric limits, moderator configuration and mounted writable database volume; inspect the deployment guide.",
  );
  process.exit(1);
}
await import(pathToFileURL(path.resolve("server.js")).href);
