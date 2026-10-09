import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { componentId } from "./components";

export type ReusablePiece = {
  name: string;
  path: string;
  description: string;
  category?: string;
  dependencies?: string[];
  related_paths?: string[];
  test_paths?: string[];
  integration_notes?: string;
  limitations?: string[];
  source_sampled?: boolean;
  owner_reviewed_at?: string;
};

export type Summary = {
  languages: string[];
  frameworks: string[];
  reusable_pieces: ReusablePiece[];
  overview: string;
  // Server-observed sampling metadata. Never accepted from generated JSON.
  source_files?: {
    path: string;
    coverage: "complete" | "prefix";
    sampled_characters: number;
  }[];
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
  source_sha: string | null;
  analyzed_at: string | null;
  summary_model: string | null;
  moderation_hidden_at?: string | null;
};

type Row = Omit<Listing, "summary"> & { summary_json: string };

const g = globalThis as unknown as { __db?: Database.Database };

function open() {
  const file =
    process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "salvage.db");
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
    CREATE INDEX IF NOT EXISTS idx_summary_runs ON summary_runs(owner_id, at);
    CREATE TABLE IF NOT EXISTS active_analyses (github_repo_id INTEGER PRIMARY KEY, owner_id INTEGER NOT NULL, token TEXT NOT NULL UNIQUE, expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS request_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL);
  `);
  const columns = new Set(
    (db.prepare("PRAGMA table_info(listings)").all() as { name: string }[]).map(
      (c) => c.name,
    ),
  );
  for (const column of [
    "source_sha",
    "analyzed_at",
    "summary_model",
    "moderation_hidden_at",
  ]) {
    if (!columns.has(column))
      db.exec(`ALTER TABLE listings ADD COLUMN ${column} TEXT`);
  }
  const reportColumns = new Set(
    (db.prepare("PRAGMA table_info(reports)").all() as { name: string }[]).map(
      (c) => c.name,
    ),
  );
  if (!reportColumns.has("resolved_at"))
    db.exec("ALTER TABLE reports ADD COLUMN resolved_at TEXT");
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_reports_queue ON reports(resolved_at, at DESC, id DESC)",
  );
  return db;
}

export const db = () => (g.__db ??= open());

const hydrate = (r: Row): Listing => {
  const { summary_json, ...rest } = r;
  return { ...rest, summary: JSON.parse(summary_json) as Summary };
};

export function upsertListing(
  l: Omit<Listing, "id" | "used_count" | "created_at">,
) {
  const { summary, ...cols } = l;
  db()
    .prepare(
      `INSERT INTO listings (github_repo_id, owner_login, owner_id, name, full_name, url, description, language,
        stars, forks, license, last_human_commit, owner_note, summary_json, source_sha, analyzed_at, summary_model)
       VALUES (@github_repo_id, @owner_login, @owner_id, @name, @full_name, @url, @description, @language,
        @stars, @forks, @license, @last_human_commit, @owner_note, @summary_json, @source_sha, @analyzed_at, @summary_model)
       ON CONFLICT(github_repo_id) DO UPDATE SET
        owner_id=excluded.owner_id, owner_login=excluded.owner_login, name=excluded.name, full_name=excluded.full_name, url=excluded.url,
        description=excluded.description, language=excluded.language, stars=excluded.stars, forks=excluded.forks,
        license=excluded.license, last_human_commit=excluded.last_human_commit, owner_note=excluded.owner_note,
        summary_json=excluded.summary_json, source_sha=excluded.source_sha, analyzed_at=excluded.analyzed_at, summary_model=excluded.summary_model`,
    )
    .run({ ...cols, summary_json: JSON.stringify(summary) });
}

export function getListing(id: number): Listing | null {
  const r = db().prepare("SELECT * FROM listings WHERE id = ?").get(id) as
    Row | undefined;
  return r ? hydrate(r) : null;
}

export function listingsByOwner(ownerId: number): Listing[] {
  return (
    db()
      .prepare("SELECT * FROM listings WHERE owner_id = ?")
      .all(ownerId) as Row[]
  ).map(hydrate);
}

export function deleteListing(id: number, ownerId: number) {
  db().transaction(() => {
    const listing = getListing(id);
    if (listing?.owner_id !== ownerId) return;
    db()
      .prepare("DELETE FROM active_analyses WHERE github_repo_id = ?")
      .run(listing.github_repo_id);
    db().prepare("DELETE FROM reports WHERE listing_id = ?").run(id);
    db()
      .prepare("DELETE FROM listings WHERE id = ? AND owner_id = ?")
      .run(id, ownerId);
  })();
}

/** Owner review is tied to the exact analysis and is invalidated by re-summarization. */
export function reviewComponent(
  id: number,
  ownerId: number,
  partId: string,
  sourceSha: string,
  analyzedAt: string,
  reviewed: boolean,
): boolean {
  return db().transaction(() => {
    const listing = getListing(id);
    if (
      !listing ||
      listing.owner_id !== ownerId ||
      listing.source_sha !== sourceSha ||
      listing.analyzed_at !== analyzedAt
    )
      return false;
    const piece = listing.summary.reusable_pieces.find((p) => {
      return componentId(p) === partId;
    });
    if (!piece) return false;
    if (reviewed) piece.owner_reviewed_at = new Date().toISOString();
    else delete piece.owner_reviewed_at;
    db()
      .prepare(
        "UPDATE listings SET summary_json = ? WHERE id = ? AND owner_id = ?",
      )
      .run(JSON.stringify(listing.summary), id, ownerId);
    return true;
  })();
}

/** Complete local inventory for component facets and filtering; visibility is checked separately. */
export function allListings(): Listing[] {
  return (
    db()
      .prepare("SELECT * FROM listings ORDER BY created_at DESC, id DESC")
      .all() as Row[]
  ).map(hydrate);
}

export function incrementUsed(id: number) {
  db()
    .prepare("UPDATE listings SET used_count = used_count + 1 WHERE id = ?")
    .run(id);
}

export function searchListings(opts: {
  q?: string;
  language?: string;
  license?: string;
}): Listing[] {
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
    languages: (
      d
        .prepare(
          "SELECT DISTINCT language AS v FROM listings WHERE language IS NOT NULL ORDER BY v",
        )
        .all() as { v: string }[]
    ).map((r) => r.v),
    licenses: (
      d
        .prepare(
          "SELECT DISTINCT license AS v FROM listings WHERE license IS NOT NULL ORDER BY v",
        )
        .all() as { v: string }[]
    ).map((r) => r.v),
  };
}

function configuredLimit(value: string | undefined, fallback: number) {
  const number = value === undefined ? fallback : Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : fallback;
}
const DAILY_SUMMARY_LIMIT = configuredLimit(
  process.env.DAILY_SUMMARY_LIMIT,
  10,
);
const GLOBAL_DAILY_SUMMARY_LIMIT = configuredLimit(
  process.env.GLOBAL_DAILY_SUMMARY_LIMIT,
  100,
);

/** Reserve one summary run for this user; false when they are over the daily cap. */
export function takeSummaryRun(ownerId: number): boolean {
  return db().transaction(() => {
    const d = db();
    d.prepare(
      "DELETE FROM summary_runs WHERE at <= datetime('now', '-31 days')",
    ).run();
    const { n } = d
      .prepare(
        "SELECT COUNT(*) AS n FROM summary_runs WHERE owner_id = ? AND at > datetime('now', '-1 day')",
      )
      .get(ownerId) as { n: number };
    if (n >= DAILY_SUMMARY_LIMIT) return false;
    const total = (
      d
        .prepare(
          "SELECT COUNT(*) AS n FROM summary_runs WHERE at > datetime('now', '-1 day')",
        )
        .get() as { n: number }
    ).n;
    if (total >= GLOBAL_DAILY_SUMMARY_LIMIT) return false;
    d.prepare("INSERT INTO summary_runs (owner_id) VALUES (?)").run(ownerId);
    return true;
  })();
}

export function analysisBaseline(
  repoId: number,
): { id: number; analyzed_at: string | null } | null {
  return (
    (db()
      .prepare("SELECT id, analyzed_at FROM listings WHERE github_repo_id = ?")
      .get(repoId) as { id: number; analyzed_at: string | null } | undefined) ??
    null
  );
}

/** Serialize paid analysis per repository; owner removal cancels its publication token. */
export function beginAnalysis(
  repoId: number,
  ownerId: number,
  expected = analysisBaseline(repoId),
): string {
  return db().transaction(() => {
    const current = analysisBaseline(repoId);
    if (
      current?.id !== expected?.id ||
      current?.analyzed_at !== expected?.analyzed_at
    )
      throw new Error(
        "This listing changed while GitHub was responding. Refresh before analyzing it again.",
      );
    db()
      .prepare("DELETE FROM active_analyses WHERE expires_at <= ?")
      .run(Date.now());
    if (
      db()
        .prepare("SELECT 1 FROM active_analyses WHERE github_repo_id = ?")
        .get(repoId)
    )
      throw new Error(
        "This repository already has an analysis in progress. Wait for it to finish before trying again.",
      );
    if (!takeSummaryRun(ownerId))
      throw new Error(
        "The daily analysis allowance is exhausted for your account or this installation. Try again tomorrow.",
      );
    const token = randomUUID();
    db()
      .prepare("INSERT INTO active_analyses VALUES (?, ?, ?, ?)")
      .run(repoId, ownerId, token, Date.now() + 600_000);
    return token;
  })();
}

export function analysisIsActive(token: string): boolean {
  return !!db()
    .prepare("SELECT 1 FROM active_analyses WHERE token = ? AND expires_at > ?")
    .get(token, Date.now());
}

export function finishAnalysis(
  token: string,
  listing: Parameters<typeof upsertListing>[0],
): boolean {
  return db().transaction(() => {
    const active = db()
      .prepare(
        "SELECT 1 FROM active_analyses WHERE token = ? AND github_repo_id = ? AND owner_id = ? AND expires_at > ?",
      )
      .get(token, listing.github_repo_id, listing.owner_id, Date.now());
    if (!active) return false;
    upsertListing(listing);
    releaseAnalysis(token);
    return true;
  })();
}

export function releaseAnalysis(token: string) {
  db().prepare("DELETE FROM active_analyses WHERE token = ?").run(token);
}

export function takeRequest(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): boolean {
  return db().transaction(() => {
    db().prepare("DELETE FROM request_limits WHERE expires_at <= ?").run(now);
    const row = db()
      .prepare("SELECT count FROM request_limits WHERE key = ?")
      .get(key) as { count: number } | undefined;
    if (row && row.count >= limit) return false;
    db()
      .prepare(
        "INSERT INTO request_limits (key, count, expires_at) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = count + 1",
      )
      .run(key, now + windowMs);
    return true;
  })();
}

export function addReport(listingId: number, reason: string) {
  return (
    db()
      .prepare(
        "INSERT INTO reports (listing_id, reason) SELECT id, ? FROM listings WHERE id = ? AND moderation_hidden_at IS NULL",
      )
      .run(reason.slice(0, 500), listingId).changes > 0
  );
}

export type ModerationReport = {
  id: number;
  listing_id: number;
  reason: string;
  at: string;
  resolved_at: string | null;
  full_name: string | null;
  moderation_hidden_at: string | null;
};
export function unresolvedReportCount(): number {
  return (
    db()
      .prepare("SELECT COUNT(*) AS n FROM reports WHERE resolved_at IS NULL")
      .get() as { n: number }
  ).n;
}
export function moderationReports(page = 1): ModerationReport[] {
  return db()
    .prepare(
      "SELECT reports.*, listings.full_name, listings.moderation_hidden_at FROM reports LEFT JOIN listings ON listings.id = reports.listing_id WHERE resolved_at IS NULL ORDER BY at DESC, reports.id DESC LIMIT 50 OFFSET ?",
    )
    .all((Math.max(1, Math.floor(page)) - 1) * 50) as ModerationReport[];
}
export function moderateReport(
  reportId: number,
  action: "hide" | "restore" | "resolve",
): boolean {
  return db().transaction(() => {
    const report = db()
      .prepare(
        "SELECT listing_id FROM reports WHERE id = ? AND resolved_at IS NULL",
      )
      .get(reportId) as { listing_id: number } | undefined;
    if (!report) return false;
    // Keep hidden listings in the unresolved queue so restoration remains available.
    if (
      action === "resolve" &&
      getListing(report.listing_id)?.moderation_hidden_at
    )
      return false;
    if (action === "hide")
      db()
        .prepare(
          "UPDATE listings SET moderation_hidden_at = datetime('now') WHERE id = ?",
        )
        .run(report.listing_id);
    if (action === "restore")
      db()
        .prepare("UPDATE listings SET moderation_hidden_at = NULL WHERE id = ?")
        .run(report.listing_id);
    if (action === "resolve")
      db()
        .prepare(
          "UPDATE reports SET resolved_at = datetime('now') WHERE id = ?",
        )
        .run(reportId);
    return true;
  })();
}
