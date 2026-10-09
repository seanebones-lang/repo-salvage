import { cache } from "react";
import { sourcePrefix } from "./http";
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

/** Request-scoped deduplication only: never retain a positive visibility check across requests. */
export const verifiedPublicRepo = cache(
  async (id: number, ownerId: number): Promise<GhRepo | null> => {
    if (
      !Number.isSafeInteger(id) ||
      id < 1 ||
      !Number.isSafeInteger(ownerId) ||
      ownerId < 1
    )
      return null;
    try {
      const res = await publicFetch(`/repositories/${id}`);
      if (!res.ok) return null;
      const repo = (await res.json()) as GhRepo;
      return repo.id === id &&
        repo.private === false &&
        repo.owner.id === ownerId
        ? repo
        : null;
    } catch {
      return null;
    }
  },
);

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
};

/** Tree listing plus a bounded sample of manifests, README and source files. */
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
