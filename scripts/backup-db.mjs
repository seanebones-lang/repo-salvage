import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

export async function backupDatabase(source, destination) {
  const input = path.resolve(source),
    output = path.resolve(destination);
  for (const exposed of ["public", ".next/static"])
    if (
      output === path.resolve(exposed) ||
      output.startsWith(path.resolve(exposed) + path.sep)
    )
      throw new Error("Backup destination must be outside public assets.");
  const realOutput = path.join(
    await fs.realpath(path.dirname(output)),
    path.basename(output),
  );
  for (const exposed of ["public", ".next/static"]) {
    const realAssets = await fs
      .realpath(exposed)
      .catch(() => path.resolve(exposed));
    if (
      realOutput === realAssets ||
      realOutput.startsWith(realAssets + path.sep)
    )
      throw new Error("Backup destination must be outside public assets.");
  }
  const db = new Database(input, { readonly: true, fileMustExist: true });
  let created = false;
  try {
    if (db.pragma("quick_check", { simple: true }) !== "ok")
      throw new Error("Source database integrity check failed.");
    // Reserve a new private file before SQLite's online backup API opens it.
    const file = await fs.open(output, "wx", 0o600);
    created = true;
    await file.close();
    await db.backup(output);
    const copy = new Database(output, { readonly: true, fileMustExist: true });
    try {
      if (copy.pragma("quick_check", { simple: true }) !== "ok")
        throw new Error("Backup integrity check failed.");
    } finally {
      copy.close();
    }
    return { status: "ok", bytes: (await fs.stat(output)).size };
  } catch (error) {
    if (created) await fs.unlink(output).catch(() => {});
    throw error;
  } finally {
    db.close();
  }
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  if (process.argv.length !== 3) {
    console.error(
      "Usage: node scripts/backup-db.mjs NEW_BACKUP_PATH (source: DATABASE_PATH)",
    );
    process.exitCode = 1;
  } else {
    try {
      console.log(
        JSON.stringify(
          await backupDatabase(
            process.env.DATABASE_PATH ?? path.resolve("data/salvage.db"),
            process.argv[2],
          ),
        ),
      );
    } catch {
      console.error(
        "Backup failed. Check source integrity, permissions and a new destination outside public assets; existing files are never overwritten.",
      );
      process.exitCode = 1;
    }
  }
}
