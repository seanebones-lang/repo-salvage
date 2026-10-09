import { cache } from "react";
import { createHash } from "node:crypto";
import { sourcePrefix } from "./http";
import { fairPathOrder, sourceRole, selectionPath } from "./source-selection";
import {
  INDEX_LIMITS,
  indexSources,
  evidencePacket,
  isCodePath,
  isTestPath,
  isManifestPath,
  isNoticePath,
  safeSourcePath,
  type SourceIndex,
  type EvidencePacket,
} from "./source-index";
const API = "https://api.github.com";

/** App credentials authenticate public API requests without granting a user's private-repo access. */
function publicHeaders(): Record<string, string> {
  const id = process.env.AUTH_GITHUB_ID;
  const secret = process.env.AUTH_GITHUB_SECRET;
  return {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    ...(id && secret
      ? {
          Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
        }
      : {}),
  };
}

let publicBlockedUntil = 0;
async function publicFetch(path: string) {
  if (Date.now() < publicBlockedUntil)
    throw new Error("GitHub public verification is temporarily rate limited");
  const res = await fetch(`${API}${path}`, {
    headers: publicHeaders(),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (
    res.status === 429 ||
    (res.status === 403 &&
      (res.headers.get("x-ratelimit-remaining") === "0" ||
        res.headers.has("retry-after")))
  ) {
    const retry = Number(res.headers.get("retry-after"));
    const reset = Number(res.headers.get("x-ratelimit-reset")) * 1000;
    const until =
      retry > 0
        ? Date.now() + retry * 1000
        : reset > Date.now()
          ? reset
          : Date.now() + 60_000;
    publicBlockedUntil = Math.min(until, Date.now() + 3_600_000);
  }
  return res;
}

export type GhRepo = {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  pushed_at: string;
  default_branch: string;
  fork: boolean;
  archived: boolean;
  private: boolean;
  license: { spdx_id: string | null; name: string } | null;
  owner: { login: string; id: number };
};

async function gh<T>(token: string, path: string): Promise<T> {
  const res = token
    ? await fetch(`${API}${path}`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      })
    : await publicFetch(path);
  if (!res.ok) throw new Error(`GitHub ${res.status} for ${path}`);
  return res.json() as Promise<T>;
}

/** Public repos owned by the authenticated user. */
export async function listPublicRepos(token: string): Promise<GhRepo[]> {
  const out: GhRepo[] = [];
  for (let page = 1; page <= 5; page++) {
    const batch = await gh<GhRepo[]>(
      token,
      `/user/repos?visibility=public&affiliation=owner&sort=pushed&per_page=100&page=${page}`,
    );
    out.push(...batch);
    if (batch.length < 100) break;
  }
  return out.filter((r) => !r.fork);
}

export async function getOwnedPublicRepo(
  token: string,
  id: number,
  ownerLogin: string,
): Promise<GhRepo> {
  const repo = await gh<GhRepo>(token, `/repositories/${id}`);
  if (
    repo.private ||
    repo.fork ||
    repo.owner.login !== ownerLogin ||
    !(await isPublicRepo(id, repo.owner.id))
  ) {
    throw new Error("Repo is not a public repository owned by you");
  }
  return repo;
}

export type PublicRepoStatus =
  { status: "public"; repo: GhRepo } | { status: "unavailable" | "excluded" };

/** Request-scoped only. Distinguish upstream failure from an excluded repository. */
export const publicRepoStatus = cache(
  async (id: number, ownerId: number): Promise<PublicRepoStatus> => {
    if (
      !Number.isSafeInteger(id) ||
      id < 1 ||
      !Number.isSafeInteger(ownerId) ||
      ownerId < 1
    )
      return { status: "excluded" };
    try {
      const res = await publicFetch(`/repositories/${id}`);
      if (!res.ok)
        return { status: res.status === 404 ? "excluded" : "unavailable" };
      const repo = (await res.json()) as GhRepo;
      return repo.id === id &&
        repo.private === false &&
        repo.owner.id === ownerId
        ? { status: "public", repo }
        : { status: "excluded" };
    } catch {
      return { status: "unavailable" };
    }
  },
);

/** Public pages still fail closed; agent APIs can report unavailable verification. */
export const verifiedPublicRepo = cache(async (id: number, ownerId: number) => {
  const result = await publicRepoStatus(id, ownerId);
  return result.status === "public" ? result.repo : null;
});

export type SourceFile = {
  path: string;
  type: string;
  mode: string;
  sha: string;
  size?: number;
};

export async function pinnedSourceTree(fullName: string, sourceSha: string) {
  if (
    !/^[a-f0-9]{40}$/.test(sourceSha) ||
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(fullName)
  )
    throw new Error("Invalid source identity");
  const result = await gh<{ truncated?: boolean; tree: SourceFile[] }>(
    "",
    `/repos/${fullName}/git/trees/${sourceSha}?recursive=1`,
  );
  if (result.truncated || !Array.isArray(result.tree))
    throw new Error("Pinned source tree is incomplete");
  return result.tree;
}

export async function isPublicRepo(
  id: number,
  ownerId: number,
): Promise<boolean> {
  return !!(await verifiedPublicRepo(id, ownerId));
}

/** Publication checks must bypass React's request cache to detect changes during generation. */
export async function isPublicRepoFresh(
  id: number,
  ownerId: number,
): Promise<boolean> {
  try {
    const res = await publicFetch(`/repositories/${id}`);
    if (!res.ok) return false;
    const repo = (await res.json()) as GhRepo;
    return (
      repo.id === id && repo.private === false && repo.owner.id === ownerId
    );
  } catch {
    return false;
  }
}

/** Fresh public identity for durable workers; never persist or need user OAuth tokens. */
export async function getPublicOwnedRepoFresh(
  id: number,
  ownerId: number,
): Promise<GhRepo> {
  const repo = await gh<GhRepo>("", `/repositories/${id}`);
  if (
    repo.id !== id ||
    repo.private !== false ||
    repo.owner.id !== ownerId ||
    repo.fork !== false ||
    !repo.license?.spdx_id ||
    repo.license.spdx_id === "NOASSERTION"
  )
    throw new Error("Repository eligibility changed.");
  return repo;
}

export async function resolveSourceCommit(
  token: string,
  repo: GhRepo,
): Promise<string> {
  const commit = await gh<{ sha: string }>(
    token,
    `/repos/${repo.full_name}/commits/${encodeURIComponent(repo.default_branch)}`,
  );
  if (!/^[a-f0-9]{40}$/.test(commit.sha))
    throw new Error("Could not resolve source commit");
  return commit.sha;
}

const BOT = /(\[bot\]|dependabot|renovate|github-actions|greenkeeper)/i;
const NOISE = /^(merge |bump |chore\(deps|update dependency)/i;

/** Date of the most recent commit that is not by a bot and not obvious dependency noise. */
export async function lastHumanCommit(
  token: string,
  repo: GhRepo,
  sourceSha?: string,
): Promise<string | null> {
  type C = {
    commit: { author: { date: string } | null; message: string };
    author: { type: string; login: string } | null;
  };
  let commits: C[];
  try {
    commits = await gh<C[]>(
      token,
      `/repos/${repo.full_name}/commits?per_page=50${sourceSha ? `&sha=${sourceSha}` : ""}`,
    );
  } catch {
    return null; // empty repos return 409
  }
  for (const c of commits) {
    const login = c.author?.login ?? "";
    if (c.author?.type === "Bot" || BOT.test(login)) continue;
    if (NOISE.test(c.commit.message)) continue;
    if (c.commit.author?.date) return c.commit.author.date;
  }
  return null;
}

const SKIP_DIR =
  /(^|\/)(node_modules|vendor|dist|build|\.git|\.next|target|__pycache__|\.venv|venv|coverage|assets|public|static|fixtures?|__snapshots__)\//;
const SKIP_FILE =
  /(\.(png|jpe?g|gif|svg|ico|woff2?|ttf|lock|min\.js|map|pdf|zip|mp[34]|wasm)$|package-lock\.json|pnpm-lock\.yaml|yarn\.lock)/i;
const MANIFEST =
  /(^|\/)(package\.json|pyproject\.toml|requirements\.txt|Cargo\.toml|go\.mod|Gemfile|composer\.json|pom\.xml|build\.gradle|Dockerfile|docker-compose\.ya?ml)$/;
const CODE =
  /\.(ts|tsx|js|jsx|mjs|py|go|rs|rb|java|kt|swift|php|cs|c|cpp|h|sh|sql|vue|svelte)$/i;

export type RepoSnapshot = {
  tree: string[];
  knownPaths: string[];
  sourceSha: string;
  files: { path: string; content: string; truncated?: boolean }[];
  index?: SourceIndex;
  packet?: EvidencePacket;
};

/** Current analyzer: bounded complete source, deterministic indexing and explicit exclusions. */
export async function indexedSnapshotRepo(
  _token: string,
  repo: GhRepo,
  sourceSha: string,
): Promise<RepoSnapshot> {
  const tree = await pinnedSourceTree(repo.full_name, sourceSha);
  if (tree.length > 10_000)
    throw new Error("Repository exceeds the 10,000-entry indexing limit.");
  const knownPaths = tree.filter((f) => f.type === "blob").map((f) => f.path);
  const skipped: SourceIndex["skipped"] = [];
  const eligible = tree.filter((file) => {
    if (file.type !== "blob") return false;
    const reason =
      !safeSourcePath(file.path) || !["100644", "100755"].includes(file.mode)
        ? "unsupported_path_or_mode"
        : SKIP_DIR.test(file.path) || SKIP_FILE.test(file.path)
          ? "excluded_generated_vendor_or_asset"
          : !(
                isCodePath(file.path) ||
                isManifestPath(file.path) ||
                isNoticePath(file.path) ||
                /(^|\/)readme(?:\.md)?$/i.test(file.path)
              )
            ? "unsupported_file_type"
            : (file.size ?? 0) > INDEX_LIMITS.fileBytes
              ? "file_byte_limit"
              : null;
    if (reason) {
      skipped.push({ path: file.path, reason });
      return false;
    }
    return true;
  });
  const priority = (file: SourceFile) =>
    isManifestPath(file.path) ||
    isNoticePath(file.path) ||
    /(^|\/)readme/i.test(file.path)
      ? 0
      : isTestPath(file.path)
        ? 4
        : sourceRole(file.path) === "library"
          ? 1
          : sourceRole(file.path) === "module"
            ? 2
            : 3;
  // Balance parent branches as well as leaves: many route subdirectories must
  // not buy more turns than a sibling utilities directory. All reads still
  // verify complete pinned blobs; file size does not imply usefulness.
  const ordered: SourceFile[] = [];
  for (const rank of [0, 1, 2, 3, 4]) {
    ordered.push(
      ...fairPathOrder(
        eligible.filter((f) => priority(f) === rank),
        (f) => (rank === 1 ? selectionPath(f.path) : f.path),
        (a, b) =>
          Number(!isNoticePath(a.path)) - Number(!isNoticePath(b.path)) ||
          Number(!isManifestPath(a.path)) - Number(!isManifestPath(b.path)) ||
          (rank === 1 ? (a.size ?? 0) - (b.size ?? 0) : 0) ||
          (a.path < b.path ? -1 : a.path > b.path ? 1 : 0),
      ),
    );
  }
  const files: RepoSnapshot["files"] = [];
  const attempted = new Set<string>();
  const initialPaths: string[] = [],
    followupPaths: string[] = [],
    fillPaths: string[] = [];
  const deadline = Date.now() + INDEX_LIMITS.inspectionMilliseconds;
  let bytes = 0;
  const readFile = async (file: SourceFile, byteAllowance: number) => {
    const remainingMilliseconds = deadline - Date.now();
    if (
      attempted.has(file.path) ||
      attempted.size >= INDEX_LIMITS.files ||
      remainingMilliseconds <= 0 ||
      bytes >= byteAllowance ||
      (file.size ?? 0) > byteAllowance - bytes
    )
      return false;
    attempted.add(file.path);
    const limit = Math.min(INDEX_LIMITS.fileBytes, byteAllowance - bytes);
    const response = await fetch(
      `https://raw.githubusercontent.com/${repo.full_name}/${sourceSha}/${file.path.split("/").map(encodeURIComponent).join("/")}`,
      {
        cache: "no-store",
        signal: AbortSignal.timeout(Math.min(10_000, remainingMilliseconds)),
      },
    );
    if (!response.ok)
      throw new Error(`Could not read indexed file: ${file.path}`);
    const read = await sourcePrefix(response, limit + 1);
    const body = Buffer.from(read.bytes);
    const truncated = read.truncated || body.length > limit;
    if (
      !truncated &&
      (!/^[a-f0-9]{40}$/.test(file.sha) ||
        createHash("sha1")
          .update(Buffer.concat([Buffer.from(`blob ${body.length}\0`), body]))
          .digest("hex") !== file.sha)
    )
      throw new Error(
        `Indexed source does not match its pinned Git blob: ${file.path}`,
      );
    let content: string;
    try {
      content = new TextDecoder("utf-8", {
        fatal: !truncated,
        ignoreBOM: true,
      }).decode(body.subarray(0, limit));
    } catch {
      skipped.push({ path: file.path, reason: "unsupported_encoding" });
      bytes += Math.min(body.length, limit);
      return true;
    }
    bytes += Math.min(body.length, limit);
    files.push({ path: file.path, content, truncated });
    return true;
  };
  // Reserve an allowance for dependency/test inspection; avoid spending the
  // broad pass entirely on documentation in large multi-package repositories.
  let metadataReads = 0;
  let libraryReads = 0;
  for (const file of ordered) {
    if (attempted.size >= INDEX_LIMITS.initialFiles) break;
    if (
      priority(file) === 0 &&
      metadataReads >= INDEX_LIMITS.initialMetadataFiles
    )
      continue;
    if (
      priority(file) === 1 &&
      libraryReads >= INDEX_LIMITS.initialLibraryFiles
    )
      continue;
    if (await readFile(file, INDEX_LIMITS.initialBytes)) {
      initialPaths.push(file.path);
      if (priority(file) === 0) metadataReads++;
      if (priority(file) === 1) libraryReads++;
    }
  }
  let index = indexSources(files, knownPaths, skipped);
  while (followupPaths.length < INDEX_LIMITS.followupFiles) {
    const candidates = new Map<string, number>();
    for (const target of new Map(
      index.targets.map((t) => [t.path, t]),
    ).values()) {
      for (const file of target.supporting_paths)
        if (!attempted.has(file)) candidates.set(file, 0);
      const base = target.path.split("/").at(-1)!;
      const dot = base.lastIndexOf(".");
      const stem = base.slice(0, dot),
        ext = base.slice(dot + 1);
      const testNames = [
        `${stem}.test.${ext}`,
        `${stem}.spec.${ext}`,
        `${stem}_test.${ext}`,
        `test_${stem}.py`,
      ];
      for (const file of eligible)
        if (
          isTestPath(file.path) &&
          testNames.includes(file.path.split("/").at(-1)!) &&
          !attempted.has(file.path) &&
          !candidates.has(file.path)
        )
          candidates.set(file.path, 1);
      for (const file of target.notice_paths)
        if (!attempted.has(file) && !candidates.has(file))
          candidates.set(file, 2);
    }
    const next = [...candidates]
      .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
      .map(([file]) => eligible.find((f) => f.path === file))
      .find(
        (file) =>
          file &&
          attempted.size < INDEX_LIMITS.files &&
          Date.now() < deadline &&
          bytes < INDEX_LIMITS.totalBytes &&
          (file.size ?? 0) <= INDEX_LIMITS.totalBytes - bytes,
      );
    if (!next || !(await readFile(next, INDEX_LIMITS.totalBytes))) break;
    followupPaths.push(next.path);
    index = indexSources(files, knownPaths, skipped);
  }
  // Unused follow-up allowance returns to broad discovery, keeping the same
  // overall read/byte limits when no known dependency context is missing.
  for (const file of ordered)
    if (await readFile(file, INDEX_LIMITS.totalBytes))
      fillPaths.push(file.path);
  for (const file of ordered)
    if (!attempted.has(file.path))
      skipped.push({
        path: file.path,
        reason:
          Date.now() >= deadline
            ? "inspection_time_limit"
            : attempted.size >= INDEX_LIMITS.files
              ? "file_count_limit"
              : "repository_byte_limit",
      });
  index = indexSources(files, knownPaths, skipped);
  index.inspection = {
    initial_paths: initialPaths,
    followup_paths: followupPaths,
    fill_paths: fillPaths,
    deadline_reached: Date.now() >= deadline,
  };
  return {
    sourceSha,
    knownPaths,
    tree: knownPaths.slice(0, 300),
    files,
    index,
    packet: evidencePacket(index),
  };
}

/** Legacy baseline retained for offline comparisons; publication uses indexedSnapshotRepo. */
export async function snapshotRepo(
  token: string,
  repo: GhRepo,
  sourceSha: string,
): Promise<RepoSnapshot> {
  if (!/^[a-f0-9]{40}$/.test(sourceSha))
    throw new Error("Invalid source commit");
  const tree = await gh<{
    truncated?: boolean;
    tree: { path: string; type: string; size?: number }[];
  }>("", `/repos/${repo.full_name}/git/trees/${sourceSha}?recursive=1`).catch(
    () => {
      throw new Error("Could not read this repository's files (is it empty?)");
    },
  );
  if (tree.truncated)
    throw new Error(
      "Repository tree is incomplete; summary cannot be verified",
    );
  const knownPaths = tree.tree
    .filter((t) => t.type === "blob")
    .map((t) => t.path);
  const blobs = tree.tree.filter(
    (t) =>
      t.type === "blob" && !SKIP_DIR.test(t.path) && !SKIP_FILE.test(t.path),
  );
  const readme = blobs.find((b) => /^readme(\.md)?$/i.test(b.path));
  const manifests = blobs.filter((b) => MANIFEST.test(b.path)).slice(0, 4);
  const code = blobs
    .filter(
      (b) => CODE.test(b.path) && (b.size ?? 0) > 200 && (b.size ?? 0) < 20_000,
    )
    // Prefer larger, shallower files: most likely to hold real logic.
    .sort(
      (a, b) =>
        (b.size ?? 0) / (1 + b.path.split("/").length) -
        (a.size ?? 0) / (1 + a.path.split("/").length),
    )
    .slice(0, 14);
  const picks = [
    ...new Map(
      [...(readme ? [readme] : []), ...manifests, ...code].map((p) => [
        p.path,
        p,
      ]),
    ).values(),
  ];
  if (!picks.length)
    throw new Error("No readable source or documentation to summarize");

  const files: RepoSnapshot["files"] = [];
  let budget = 70_000;
  for (const p of picks) {
    if (budget <= 0) break;
    try {
      const res = await fetch(
        `https://raw.githubusercontent.com/${repo.full_name}/${sourceSha}/${p.path.split("/").map(encodeURIComponent).join("/")}`,
        {
          cache: "no-store",
          signal: AbortSignal.timeout(10_000),
        },
      );
      if (!res.ok) throw new Error(`Could not read sampled file: ${p.path}`);
      const prefix = await sourcePrefix(res);
      const content = prefix.text.slice(0, Math.min(6_000, budget));
      if (!content.trim()) throw new Error(`Sampled file is empty: ${p.path}`);
      budget -= content.length;
      files.push({
        path: p.path,
        content,
        truncated: prefix.truncated || prefix.text.length > content.length,
      });
    } catch {
      throw new Error(`Could not read sampled file: ${p.path}`);
    }
  }
  const promptPaths = [
    ...new Set([...files.map((f) => f.path), ...blobs.map((b) => b.path)]),
  ].slice(0, 300);
  return { tree: promptPaths, knownPaths, sourceSha, files };
}
