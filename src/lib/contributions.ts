import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  db,
  takeRequest,
  beginAnalysis,
  finishAnalysis,
  releaseAnalysis,
  type Listing,
} from "./db";
import { AgentError } from "./agent-api";

export type Credential = {
  id: string;
  owner_id: number;
  name: string;
  repo_ids: number[];
  expires_at: number;
  revoked_at: number | null;
  created_at: number;
};
export type Draft = {
  id: string;
  credential_id: string;
  owner_id: number;
  repo_id: number;
  full_name: string;
  source_sha: string;
  note: string;
  status: "pending" | "analyzing" | "published" | "dismissed";
  created_at: number;
  analysis_token: string | null;
  listing_id: number | null;
};
const initialized = new WeakSet<object>();
function store() {
  const d = db();
  if (!initialized.has(d)) {
    d.exec(`CREATE TABLE IF NOT EXISTS agent_credentials (
      id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, owner_id INTEGER NOT NULL,
      name TEXT NOT NULL, repo_ids_json TEXT NOT NULL, expires_at INTEGER NOT NULL,
      revoked_at INTEGER, created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_agent_credentials_owner ON agent_credentials(owner_id);
    CREATE TABLE IF NOT EXISTS agent_drafts (
      id TEXT PRIMARY KEY, credential_id TEXT NOT NULL, owner_id INTEGER NOT NULL,
      repo_id INTEGER NOT NULL, full_name TEXT NOT NULL, source_sha TEXT NOT NULL,
      note TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', created_at INTEGER NOT NULL,
      idempotency_key TEXT NOT NULL, payload_hash TEXT NOT NULL,
      analysis_token TEXT, listing_id INTEGER,
      UNIQUE(credential_id, idempotency_key)
    );
    CREATE INDEX IF NOT EXISTS idx_agent_drafts_owner ON agent_drafts(owner_id, created_at DESC);`);
    initialized.add(d);
  }
  return d;
}
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
function credential(row: Record<string, unknown>): Credential {
  return {
    id: row.id as string,
    owner_id: row.owner_id as number,
    name: row.name as string,
    repo_ids: JSON.parse(row.repo_ids_json as string),
    expires_at: row.expires_at as number,
    revoked_at: row.revoked_at as number | null,
    created_at: row.created_at as number,
  };
}
export function credentialsForOwner(ownerId: number): Credential[] {
  return (
    store()
      .prepare(
        "SELECT * FROM agent_credentials WHERE owner_id = ? ORDER BY (revoked_at IS NULL AND expires_at > ?) DESC, created_at DESC LIMIT 50",
      )
      .all(ownerId, Date.now()) as Record<string, unknown>[]
  ).map(credential);
}
export function issueCredential(
  ownerId: number,
  name: string,
  repoIds: number[],
  hours: number,
) {
  if (
    !Number.isSafeInteger(ownerId) ||
    ownerId < 1 ||
    !name.trim() ||
    name.length > 80 ||
    !Number.isInteger(hours) ||
    hours < 1 ||
    hours > 168 ||
    !repoIds.length ||
    repoIds.length > 20 ||
    repoIds.some((id) => !Number.isSafeInteger(id) || id < 1)
  )
    throw new AgentError(
      "invalid_credential",
      "Choose a name, 1–20 repositories and a lifetime of 1–168 hours.",
    );
  return store().transaction(() => {
    const now = Date.now();
    const active = store()
      .prepare(
        "SELECT COUNT(*) AS n FROM agent_credentials WHERE owner_id = ? AND revoked_at IS NULL AND expires_at > ?",
      )
      .get(ownerId, now) as { n: number };
    if (active.n >= 10)
      throw new AgentError(
        "credential_limit",
        "Revoke a credential before creating another.",
        409,
      );
    if (!takeRequest(`agent:issue:${ownerId}`, 20, 86_400_000))
      throw new AgentError(
        "rate_limited",
        "Credential creation allowance exhausted.",
        429,
      );
    const token = `rs_draft_${randomBytes(32).toString("base64url")}`;
    const item: Credential = {
      id: randomUUID(),
      owner_id: ownerId,
      name: name.trim(),
      repo_ids: [...new Set(repoIds)].sort((a, b) => a - b),
      expires_at: now + hours * 3_600_000,
      revoked_at: null,
      created_at: now,
    };
    store()
      .prepare(
        "INSERT INTO agent_credentials VALUES (?, ?, ?, ?, ?, ?, NULL, ?)",
      )
      .run(
        item.id,
        hash(token),
        ownerId,
        item.name,
        JSON.stringify(item.repo_ids),
        item.expires_at,
        now,
      );
    return { credential: item, token };
  })();
}
export function activeCredential(
  id: string,
  now = Date.now(),
): Credential | null {
  const row = store()
    .prepare(
      "SELECT * FROM agent_credentials WHERE id = ? AND revoked_at IS NULL AND expires_at > ?",
    )
    .get(id, now) as Record<string, unknown> | undefined;
  return row ? credential(row) : null;
}
export function authenticateAgent(request: Request): Credential {
  const authorization = request.headers.get("authorization") ?? "";
  if (!/^Bearer rs_draft_[A-Za-z0-9_-]{43}$/.test(authorization))
    throw new AgentError(
      "unauthorized",
      "A valid scoped draft credential is required.",
      401,
    );
  const row = store()
    .prepare(
      "SELECT * FROM agent_credentials WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ?",
    )
    .get(hash(authorization.slice(7)), Date.now()) as
    Record<string, unknown> | undefined;
  if (!row)
    throw new AgentError(
      "unauthorized",
      "A valid scoped draft credential is required.",
      401,
    );
  const item = credential(row);
  if (!takeRequest(`agent:private:${item.owner_id}`, 30, 60_000))
    throw new AgentError(
      "rate_limited",
      "Private agent request allowance exhausted.",
      429,
    );
  return item;
}
export function revokeCredential(id: string, ownerId: number) {
  store().transaction(() => {
    if (
      !store()
        .prepare(
          "UPDATE agent_credentials SET revoked_at = ? WHERE id = ? AND owner_id = ? AND revoked_at IS NULL",
        )
        .run(Date.now(), id, ownerId).changes
    )
      return;
    const drafts = store()
      .prepare(
        "SELECT analysis_token FROM agent_drafts WHERE credential_id = ? AND status IN ('pending','analyzing')",
      )
      .all(id) as { analysis_token: string | null }[];
    for (const draft of drafts)
      if (draft.analysis_token) releaseAnalysis(draft.analysis_token);
    store()
      .prepare(
        "UPDATE agent_drafts SET status = 'dismissed', analysis_token = NULL WHERE credential_id = ? AND status IN ('pending','analyzing')",
      )
      .run(id);
  })();
}
export function draftById(id: string, ownerId: number): Draft | null {
  return (
    (store()
      .prepare(
        "SELECT id, credential_id, owner_id, repo_id, full_name, source_sha, note, status, created_at, analysis_token, listing_id FROM agent_drafts WHERE id = ? AND owner_id = ?",
      )
      .get(id, ownerId) as Draft | undefined) ?? null
  );
}
export function draftsForOwner(ownerId: number): Draft[] {
  // Recover a crashed/expired reservation without allowing a late worker to publish.
  store()
    .prepare(
      "UPDATE agent_drafts SET status = 'pending', analysis_token = NULL WHERE owner_id = ? AND status = 'analyzing' AND NOT EXISTS (SELECT 1 FROM active_analyses WHERE token = agent_drafts.analysis_token AND expires_at > ?)",
    )
    .run(ownerId, Date.now());
  return store()
    .prepare(
      "SELECT id, credential_id, owner_id, repo_id, full_name, source_sha, note, status, created_at, analysis_token, listing_id FROM agent_drafts WHERE owner_id = ? ORDER BY (status IN ('pending','analyzing')) DESC, created_at DESC, id DESC LIMIT 50",
    )
    .all(ownerId) as Draft[];
}
export function replayDraft(
  item: Credential,
  key: string,
  payloadHash: string,
): Draft | null {
  const row = store()
    .prepare(
      "SELECT id, payload_hash FROM agent_drafts WHERE credential_id = ? AND idempotency_key = ?",
    )
    .get(item.id, key) as { id: string; payload_hash: string } | undefined;
  if (!row) return null;
  if (row.payload_hash !== payloadHash)
    throw new AgentError(
      "idempotency_conflict",
      "This key already belongs to another proposal.",
      409,
    );
  return draftById(row.id, item.owner_id);
}
export function createDraft(
  item: Credential,
  key: string,
  payloadHash: string,
  proposal: Pick<Draft, "repo_id" | "full_name" | "source_sha" | "note">,
): { draft: Draft; created: boolean } {
  return store().transaction(() => {
    if (!activeCredential(item.id)?.repo_ids.includes(proposal.repo_id))
      throw new AgentError(
        "unauthorized",
        "Credential expired, revoked or outside this repository scope.",
        401,
      );
    const replay = replayDraft(item, key, payloadHash);
    if (replay) return { draft: replay, created: false };
    const count = store()
      .prepare(
        "SELECT COUNT(*) AS n FROM agent_drafts WHERE owner_id = ? AND status IN ('pending','analyzing')",
      )
      .get(item.owner_id) as { n: number };
    if (
      count.n >= 50 ||
      !takeRequest(`agent:drafts:${item.owner_id}`, 50, 86_400_000)
    )
      throw new AgentError(
        "draft_limit",
        "Draft allowance exhausted. Review or dismiss existing drafts.",
        429,
      );
    const id = randomUUID();
    store()
      .prepare(
        "INSERT INTO agent_drafts (id, credential_id, owner_id, repo_id, full_name, source_sha, note, created_at, idempotency_key, payload_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        id,
        item.id,
        item.owner_id,
        proposal.repo_id,
        proposal.full_name,
        proposal.source_sha,
        proposal.note,
        Date.now(),
        key,
        payloadHash,
      );
    return { draft: draftById(id, item.owner_id)!, created: true };
  })();
}
export function dismissDraft(id: string, ownerId: number) {
  store().transaction(() => {
    const draft = draftById(id, ownerId);
    if (!draft || !["pending", "analyzing"].includes(draft.status)) return;
    if (draft.analysis_token) releaseAnalysis(draft.analysis_token);
    store()
      .prepare(
        "UPDATE agent_drafts SET status = 'dismissed', analysis_token = NULL WHERE id = ?",
      )
      .run(id);
  })();
}
export function claimDraft(
  id: string,
  ownerId: number,
  repoId: number,
  sourceSha: string,
  baseline: Parameters<typeof beginAnalysis>[2],
): string {
  return store().transaction(() => {
    const hidden = store()
      .prepare(
        "SELECT moderation_hidden_at FROM listings WHERE github_repo_id = ?",
      )
      .get(repoId) as { moderation_hidden_at: string | null } | undefined;
    if (hidden?.moderation_hidden_at)
      throw new Error(
        "This listing is hidden by moderation. Resolve that before analyzing a draft.",
      );
    const draft = draftById(id, ownerId);
    if (
      !draft ||
      draft.status !== "pending" ||
      draft.repo_id !== repoId ||
      draft.source_sha !== sourceSha ||
      !activeCredential(draft.credential_id)?.repo_ids.includes(repoId)
    )
      throw new Error(
        "This draft is no longer actionable. Refresh your agent inbox.",
      );
    const token = beginAnalysis(repoId, ownerId, baseline);
    store()
      .prepare(
        "UPDATE agent_drafts SET status = 'analyzing', analysis_token = ? WHERE id = ?",
      )
      .run(token, id);
    return token;
  })();
}
export function draftAnalysisActive(
  id: string,
  ownerId: number,
  token: string,
) {
  const draft = draftById(id, ownerId);
  return (
    !!draft &&
    draft.status === "analyzing" &&
    draft.analysis_token === token &&
    !!activeCredential(draft.credential_id)?.repo_ids.includes(draft.repo_id)
  );
}
export function publishDraft(
  id: string,
  token: string,
  listing: Parameters<typeof finishAnalysis>[1],
) {
  return store().transaction(() => {
    if (!draftAnalysisActive(id, listing.owner_id, token)) return false;
    const draft = draftById(id, listing.owner_id)!;
    if (
      draft.repo_id !== listing.github_repo_id ||
      draft.source_sha !== listing.source_sha ||
      !finishAnalysis(token, listing)
    )
      return false;
    const row = store()
      .prepare("SELECT id FROM listings WHERE github_repo_id = ?")
      .get(listing.github_repo_id) as Pick<Listing, "id">;
    store()
      .prepare(
        "UPDATE agent_drafts SET status = 'published', listing_id = ?, analysis_token = NULL WHERE id = ?",
      )
      .run(row.id, id);
    return true;
  })();
}
export function resetDraftAnalysis(id: string, ownerId: number, token: string) {
  store().transaction(() => {
    const draft = draftById(id, ownerId);
    if (!draft || draft.analysis_token !== token) return;
    const valid = !!activeCredential(draft.credential_id);
    store()
      .prepare(
        "UPDATE agent_drafts SET status = ?, analysis_token = NULL WHERE id = ?",
      )
      .run(valid ? "pending" : "dismissed", id);
  })();
}
export function proposalHash(repoId: number, sourceSha: string, note: string) {
  return hash(JSON.stringify([repoId, sourceSha, note]));
}
export function publicDraft(draft: Draft) {
  const {
    analysis_token: _token,
    credential_id: _credential,
    owner_id: _owner,
    ...safe
  } = draft;
  return {
    ...safe,
    format: "repo-salvage/draft-v1",
    owner_review_required: true,
    analysis_charged_on_creation: false,
  };
}

export function draftsForCredential(item: Credential): Draft[] {
  draftsForOwner(item.owner_id);
  return store()
    .prepare(
      "SELECT id, credential_id, owner_id, repo_id, full_name, source_sha, note, status, created_at, analysis_token, listing_id FROM agent_drafts WHERE credential_id = ? AND owner_id = ? ORDER BY (status IN ('pending','analyzing')) DESC, created_at DESC, id DESC LIMIT 50",
    )
    .all(item.id, item.owner_id) as Draft[];
}
