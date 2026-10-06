import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

export type Summary = {
  languages: string[];
  frameworks: string[];
  reusable_pieces: { name: string; path: string; description: string }[];
  overview: string;
};

export type Listing = {
  id: number;
  github_repo_id: number;
  owner_login: string;
  owner_id: number;
  name: string;
  full_name: string;
  url: string;
  description: string | null;
  language: string | null;
  stars: number;
  forks: number;
  license: string | null;
  last_human_commit: string | null;
  owner_note: string | null;
  summary: Summary;
  used_count: number;
  created_at: string;
};

type Row = Omit<Listing, "summary"> & { summary_json: string };

const g = globalThis as unknown as { __db?: Database.Database };

function open() {
  const file = process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "salvage.db");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS listings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      github_repo_id INTEGER NOT NULL UNIQUE,
      owner_login TEXT NOT NULL,
      owner_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      full_name TEXT NOT NULL,
      url TEXT NOT NULL,
      description TEXT,
      language TEXT,
      stars INTEGER NOT NULL DEFAULT 0,
      forks INTEGER NOT NULL DEFAULT 0,
      license TEXT,
      last_human_commit TEXT,
      owner_note TEXT,
      summary_json TEXT NOT NULL,
      used_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_listings_owner ON listings(owner_id);
    CREATE TABLE IF NOT EXISTS reports (id INTEGER PRIMARY KEY AUTOINCREMENT, listing_id INTEGER NOT NULL, reason TEXT NOT NULL, at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS summary_runs (owner_id INTEGER NOT NULL, at TEXT NOT NULL DEFAULT (datetime('now')));
  `);
  return db;
}

export const db = () => (g.__db ??= open());

const hydrate = (r: Row): Listing => {
  const { summary_json, ...rest } = r;
  return { ...rest, summary: JSON.parse(summary_json) as Summary };
};

export function upsertListing(l: Omit<Listing, "id" | "used_count" | "created_at">) {
  const { summary, ...cols } = l;
  db()
    .prepare(
      `INSERT INTO listings (github_repo_id, owner_login, owner_id, name, full_name, url, description, language,
        stars, forks, license, last_human_commit, owner_note, summary_json)
       VALUES (@github_repo_id, @owner_login, @owner_id, @name, @full_name, @url, @description, @language,
        @stars, @forks, @license, @last_human_commit, @owner_note, @summary_json)
       ON CONFLICT(github_repo_id) DO UPDATE SET
        owner_login=excluded.owner_login, name=excluded.name, full_name=excluded.full_name, url=excluded.url,
        description=excluded.description, language=excluded.language, stars=excluded.stars, forks=excluded.forks,
        license=excluded.license, last_human_commit=excluded.last_human_commit, owner_note=excluded.owner_note,
        summary_json=excluded.summary_json`,
    )
    .run({ ...cols, summary_json: JSON.stringify(summary) });
}

export function getListing(id: number): Listing | null {
  const r = db().prepare("SELECT * FROM listings WHERE id = ?").get(id) as Row | undefined;
  return r ? hydrate(r) : null;
}

export function listingsByOwner(ownerId: number): Listing[] {
  return (db().prepare("SELECT * FROM listings WHERE owner_id = ?").all(ownerId) as Row[]).map(hydrate);
}

export function deleteListing(id: number, ownerId: number) {
  db().prepare("DELETE FROM listings WHERE id = ? AND owner_id = ?").run(id, ownerId);
}

export function incrementUsed(id: number) {
  db().prepare("UPDATE listings SET used_count = used_count + 1 WHERE id = ?").run(id);
}

export function searchListings(opts: { q?: string; language?: string; license?: string }): Listing[] {
  const where: string[] = [];
  const params: Record<string, string> = {};
  if (opts.q) {
    where.push(
      "(full_name LIKE @q OR description LIKE @q OR owner_note LIKE @q OR summary_json LIKE @q)",
    );
    params.q = `%${opts.q.replace(/[%_]/g, "")}%`;
  }
  if (opts.language) {
    where.push("(language = @lang OR summary_json LIKE @langLike)");
    params.lang = opts.language;
    params.langLike = `%"${opts.language.replace(/[%_"]/g, "")}"%`;
  }
  if (opts.license) {
    where.push("license = @license");
    params.license = opts.license;
  }
  const sql = `SELECT * FROM listings ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY created_at DESC LIMIT 100`;
  return (db().prepare(sql).all(params) as Row[]).map(hydrate);
}

export function facets() {
  const d = db();
  return {
    languages: (d.prepare("SELECT DISTINCT language AS v FROM listings WHERE language IS NOT NULL ORDER BY v").all() as { v: string }[]).map((r) => r.v),
    licenses: (d.prepare("SELECT DISTINCT license AS v FROM listings WHERE license IS NOT NULL ORDER BY v").all() as { v: string }[]).map((r) => r.v),
  };
}

const DAILY_SUMMARY_LIMIT = Number(process.env.DAILY_SUMMARY_LIMIT ?? 10);

/** Reserve one summary run for this user; false when they are over the daily cap. */
export function takeSummaryRun(ownerId: number): boolean {
  const d = db();
  const { n } = d
    .prepare("SELECT COUNT(*) AS n FROM summary_runs WHERE owner_id = ? AND at > datetime('now', '-1 day')")
    .get(ownerId) as { n: number };
  if (n >= DAILY_SUMMARY_LIMIT) return false;
  d.prepare("INSERT INTO summary_runs (owner_id) VALUES (?)").run(ownerId);
  return true;
}

export function addReport(listingId: number, reason: string) {
  db().prepare("INSERT INTO reports (listing_id, reason) VALUES (?, ?)").run(listingId, reason.slice(0, 500));
}
