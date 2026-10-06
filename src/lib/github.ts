const API = "https://api.github.com";

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
  license: { spdx_id: string | null; name: string } | null;
  owner: { login: string; id: number };
};

async function gh<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    cache: "no-store",
  });
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

export async function getOwnedPublicRepo(token: string, id: number, ownerLogin: string): Promise<GhRepo> {
  const repos = await listPublicRepos(token);
  const repo = repos.find((r) => r.id === id && r.owner.login === ownerLogin);
  if (!repo) throw new Error("Repo not found among your public repositories");
  return repo;
}

const BOT = /(\[bot\]|dependabot|renovate|github-actions|greenkeeper)/i;
const NOISE = /^(merge |bump |chore\(deps|update dependency)/i;

/** Date of the most recent commit that is not by a bot and not obvious dependency noise. */
export async function lastHumanCommit(token: string, repo: GhRepo): Promise<string | null> {
  type C = { commit: { author: { date: string } | null; message: string }; author: { type: string; login: string } | null };
  let commits: C[];
  try {
    commits = await gh<C[]>(token, `/repos/${repo.full_name}/commits?per_page=50`);
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

const SKIP_DIR = /(^|\/)(node_modules|vendor|dist|build|\.git|\.next|target|__pycache__|\.venv|venv|coverage|assets|public|static|fixtures?|__snapshots__)\//;
const SKIP_FILE = /(\.(png|jpe?g|gif|svg|ico|woff2?|ttf|lock|min\.js|map|pdf|zip|mp[34]|wasm)$|package-lock\.json|pnpm-lock\.yaml|yarn\.lock)/i;
const MANIFEST = /(^|\/)(package\.json|pyproject\.toml|requirements\.txt|Cargo\.toml|go\.mod|Gemfile|composer\.json|pom\.xml|build\.gradle|Dockerfile|docker-compose\.ya?ml)$/;
const CODE = /\.(ts|tsx|js|jsx|mjs|py|go|rs|rb|java|kt|swift|php|cs|c|cpp|h|sh|sql|vue|svelte)$/i;

export type RepoSnapshot = { tree: string[]; files: { path: string; content: string }[] };

/** Tree listing plus a bounded sample of manifests, README and source files. */
export async function snapshotRepo(token: string, repo: GhRepo): Promise<RepoSnapshot> {
  const tree = await gh<{ tree: { path: string; type: string; size?: number }[] }>(
    token,
    `/repos/${repo.full_name}/git/trees/${repo.default_branch}?recursive=1`,
  ).catch(() => {
    throw new Error("Could not read this repository's files (is it empty?)");
  });
  const blobs = tree.tree.filter((t) => t.type === "blob" && !SKIP_DIR.test(t.path) && !SKIP_FILE.test(t.path));
  const readme = blobs.find((b) => /^readme(\.md)?$/i.test(b.path));
  const manifests = blobs.filter((b) => MANIFEST.test(b.path)).slice(0, 4);
  const code = blobs
    .filter((b) => CODE.test(b.path) && (b.size ?? 0) > 200 && (b.size ?? 0) < 20_000)
    // Prefer larger, shallower files: most likely to hold real logic.
    .sort((a, b) => (b.size ?? 0) / (1 + b.path.split("/").length) - (a.size ?? 0) / (1 + a.path.split("/").length))
    .slice(0, 14);
  const picks = [...(readme ? [readme] : []), ...manifests, ...code];

  const files: RepoSnapshot["files"] = [];
  let budget = 70_000;
  for (const p of picks) {
    if (budget <= 0) break;
    try {
      const res = await fetch(`https://raw.githubusercontent.com/${repo.full_name}/${repo.default_branch}/${p.path}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!res.ok) continue;
      const content = (await res.text()).slice(0, 6_000);
      budget -= content.length;
      files.push({ path: p.path, content });
    } catch {
      /* skip unreadable file */
    }
  }
  return { tree: blobs.map((b) => b.path).slice(0, 300), files };
}
