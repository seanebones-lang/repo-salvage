import { expect, it } from "vitest";
import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

it("adds nullable provenance to a legacy database without changing stored data", async () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "salvage-migration-")), "old.db");
  const old = new Database(file);
  old.exec(`CREATE TABLE listings (
    id INTEGER PRIMARY KEY AUTOINCREMENT, github_repo_id INTEGER NOT NULL UNIQUE,
    owner_login TEXT NOT NULL, owner_id INTEGER NOT NULL, name TEXT NOT NULL, full_name TEXT NOT NULL, url TEXT NOT NULL,
    description TEXT, language TEXT, stars INTEGER NOT NULL DEFAULT 0, forks INTEGER NOT NULL DEFAULT 0,
    license TEXT, last_human_commit TEXT, owner_note TEXT, summary_json TEXT NOT NULL,
    used_count INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );`);
  old.prepare("INSERT INTO listings (github_repo_id, owner_login, owner_id, name, full_name, url, summary_json, used_count) VALUES (1, 'me', 42, 'x', 'me/x', 'https://github.com/me/x', ?, 9)")
    .run(JSON.stringify({ overview: "legacy", languages: [], frameworks: [], reusable_pieces: [] }));
  old.close();
  process.env.DATABASE_PATH = file;
  const m = await import("@/lib/db");
  expect(m.getListing(1)).toMatchObject({ owner_id: 42, used_count: 9, source_sha: null, analyzed_at: null, summary_model: null, summary: { overview: "legacy" } });
  expect(m.listingsByOwner(42)).toHaveLength(1);
  m.deleteListing(1, 42);
  expect(m.getListing(1)).toBeNull();
});
