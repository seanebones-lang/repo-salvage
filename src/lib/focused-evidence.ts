import { createHash } from "node:crypto";
import { AgentError } from "./agent-error";
import { pinnedSourceTree, sourceExclusion, type SourceFile } from "./github";
import { sourcePrefix } from "./http";
import { fairPathOrder } from "./source-selection";
import {
  indexSources,
  evidencePacket,
  safeSourcePath,
  isNoticePath,
  isManifestPath,
  type IndexedInput,
} from "./source-index";

export const FOCUS_LIMITS = {
  treeEntries: 10000,
  scopeFiles: 32,
  primaryFiles: 8,
  contextFiles: 4,
  fileBytes: 64000,
  initialBytes: 192000,
  totalBytes: 256000,
  readMilliseconds: 20000,
  responseBytes: 65536,
  cacheEntries: 8,
  concurrentRequests: 4,
  cacheMilliseconds: 60000,
} as const;
export type EvidenceFocus = {
  path: string;
  symbol: string | null;
  maxCharacters: number;
};
export function evidenceFocus(params: URLSearchParams): EvidenceFocus {
  for (const key of params.keys())
    if (
      !["path", "symbol", "max_characters"].includes(key) ||
      params.getAll(key).length !== 1
    )
      throw new AgentError(
        "invalid_query",
        "Use one path, optional symbol and max_characters; no other parameters.",
      );
  const path = params.get("path") ?? "";
  const directory = path.endsWith("/");
  if (!safeSourcePath(directory ? path.slice(0, -1) : path))
    throw new AgentError(
      "invalid_query",
      "Use an exact safe file path or directory path ending in /.",
    );
  const symbol = params.get("symbol");
  if (
    symbol !== null &&
    (directory ||
      !symbol ||
      symbol.length > 160 ||
      /[\x00-\x1f\x7f]/.test(symbol))
  )
    throw new AgentError(
      "invalid_query",
      "A symbol must be 1–160 characters and applies only to an exact file.",
    );
  const rawLimit = params.get("max_characters") ?? "12000";
  if (
    !/^\d+$/.test(rawLimit) ||
    Number(rawLimit) < 1000 ||
    Number(rawLimit) > 24000
  )
    throw new AgentError(
      "invalid_query",
      "max_characters must be an integer from 1000 to 24000.",
    );
  return { path, symbol, maxCharacters: Number(rawLimit) };
}

/** Inspect a narrow pinned scope. No target repository is imported or executed. */
export async function focusedEvidence(
  fullName: string,
  commit: string,
  focus: EvidenceFocus,
) {
  const tree = await pinnedSourceTree(fullName, commit);
  if (tree.length > FOCUS_LIMITS.treeEntries)
    throw new AgentError(
      "focus_too_broad",
      "Tree exceeds 10000 entries; inspect the repository manually.",
      409,
    );
  const matched = tree.filter(
    (f) =>
      f.type === "blob" &&
      (focus.path.endsWith("/")
        ? f.path.startsWith(focus.path)
        : f.path === focus.path),
  );
  if (!matched.length)
    throw new AgentError(
      "focus_not_found",
      "No file matches this pinned scope. Check the path and trailing directory slash.",
      404,
    );
  if (matched.length > FOCUS_LIMITS.scopeFiles)
    throw new AgentError(
      "focus_too_broad",
      "Scope exceeds 32 files. Choose a narrower directory or exact file.",
      409,
    );
  const compare = (a: SourceFile, b: SourceFile) =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
  const eligible = tree.filter(
    (f) => f.type === "blob" && !sourceExclusion(f, FOCUS_LIMITS.fileBytes),
  );
  const knownPaths = tree.filter((f) => f.type === "blob").map((f) => f.path);
  const reasons = new Map<string, string>();
  for (const f of matched) {
    const reason = sourceExclusion(f, FOCUS_LIMITS.fileBytes);
    if (reason) reasons.set(f.path, reason);
  }
  const inputs: IndexedInput[] = [];
  const attempted = new Set<string>();
  const contextPaths: string[] = [];
  let bytes = 0;
  const deadline = Date.now() + FOCUS_LIMITS.readMilliseconds;
  const read = async (f: SourceFile, allowance: number) => {
    if (Date.now() >= deadline) {
      reasons.set(f.path, "read_deadline");
      return false;
    }
    if ((f.size ?? 0) > allowance - bytes || bytes >= allowance) {
      reasons.set(f.path, "byte_limit");
      return false;
    }
    attempted.add(f.path);
    const limit = Math.min(FOCUS_LIMITS.fileBytes, allowance - bytes);
    const response = await fetch(
      `https://raw.githubusercontent.com/${fullName}/${commit}/${f.path.split("/").map(encodeURIComponent).join("/")}`,
      {
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(
          Math.min(4000, Math.max(1, deadline - Date.now())),
        ),
      },
    );
    if (!response.ok) throw Error("Pinned source unavailable.");
    const captured = await sourcePrefix(response, limit + 1);
    const body = Buffer.from(captured.bytes);
    bytes += Math.min(body.length, limit);
    if (captured.truncated || body.length > limit) {
      reasons.set(f.path, "file_or_byte_limit");
      return true;
    }
    const blob = createHash("sha1")
      .update(Buffer.concat([Buffer.from(`blob ${body.length}\0`), body]))
      .digest("hex");
    if (!/^[a-f0-9]{40}$/.test(f.sha) || blob !== f.sha)
      throw new AgentError(
        "source_integrity_failed",
        "Pinned source bytes failed Git blob verification.",
        503,
      );
    try {
      const content = new TextDecoder("utf-8", {
        fatal: true,
        ignoreBOM: true,
      }).decode(body);
      inputs.push({ path: f.path, content });
    } catch {
      reasons.set(f.path, "unsupported_encoding");
    }
    return true;
  };
  const primary = fairPathOrder(
    matched.filter((f) => !reasons.has(f.path)),
    (f) => f.path,
    compare,
  );
  let primaryAttempts = 0;
  for (const file of primary) {
    if (primaryAttempts >= FOCUS_LIMITS.primaryFiles) {
      reasons.set(file.path, "file_limit");
      continue;
    }
    if (await read(file, FOCUS_LIMITS.initialBytes)) primaryAttempts++;
  }
  const skipped = () =>
    [...reasons].map(([path, reason]) => ({ path, reason }));
  const firstIndex = indexSources(inputs, knownPaths, skipped());
  const related = new Set(
    firstIndex.targets.flatMap((t) => [
      ...t.notice_paths,
      ...t.supporting_paths,
    ]),
  );
  // Preserve notices for the requested scope even when no declaration was indexed.
  const ancestors = new Set([""]);
  for (const file of matched) {
    const parts = file.path.split("/");
    for (let i = 1; i < parts.length; i++)
      ancestors.add(parts.slice(0, i).join("/"));
  }
  const contexts = eligible
    .filter(
      (f) =>
        !attempted.has(f.path) &&
        !matched.some((m) => m.path === f.path) &&
        (related.has(f.path) ||
          ((isNoticePath(f.path) || isManifestPath(f.path)) &&
            ancestors.has(f.path.split("/").slice(0, -1).join("/")))),
    )
    .sort(
      (a, b) =>
        Number(!isNoticePath(a.path)) - Number(!isNoticePath(b.path)) ||
        Number(!related.has(a.path)) - Number(!related.has(b.path)) ||
        compare(a, b),
    );
  let contextAttempts = 0;
  for (const file of contexts) {
    if (contextAttempts >= FOCUS_LIMITS.contextFiles) {
      reasons.set(file.path, "context_file_limit");
      continue;
    }
    if (await read(file, FOCUS_LIMITS.totalBytes)) {
      contextAttempts++;
      contextPaths.push(file.path);
    }
  }
  const index = contextAttempts
    ? indexSources(inputs, knownPaths, skipped())
    : firstIndex;
  const scoped = new Set(matched.map((f) => f.path));
  const targets = index.targets.filter(
    (t) =>
      scoped.has(t.path) &&
      (focus.symbol === null || t.symbol === focus.symbol),
  );
  const packetFor = (limit: number) => {
    const packet = evidencePacket({ ...index, targets }, limit);
    // An unindexed symbol can still be inspected in its complete containing file.
    if (!packet.targets.length) {
      for (const ref of index.references.filter(
        (r) => scoped.has(r.path) && r.kind === "file",
      )) {
        if (packet.references.some((r) => r.id === ref.id)) continue;
        packet.references.unshift(ref);
        if (JSON.stringify(packet).length > limit) packet.references.shift();
      }
    }
    return packet;
  };
  const build = (limit: number) => {
    const packet = packetFor(limit);
    return {
      focus: {
        path: focus.path,
        symbol: focus.symbol,
        symbol_match:
          focus.symbol === null
            ? null
            : targets.length
              ? "matched"
              : "not_indexed",
        packet_character_limit: limit,
      },
      coverage: {
        matched_files: matched.length,
        inspected_files: inputs.length,
        source_bytes: bytes,
        indexed_targets: targets.length,
        supplied_targets: packet.targets.length,
        context_paths: contextPaths,
        files: matched.sort(compare).map((f) => ({
          path: f.path,
          size_bytes:
            Number.isSafeInteger(f.size) && (f.size ?? -1) >= 0
              ? f.size!
              : null,
          download_url:
            !sourceExclusion(f, FOCUS_LIMITS.fileBytes) &&
            /^[a-f0-9]{40}$/.test(f.sha)
              ? `https://raw.githubusercontent.com/${fullName}/${commit}/${f.path.split("/").map(encodeURIComponent).join("/")}`
              : null,
          git_blob_sha: /^[a-f0-9]{40}$/.test(f.sha) ? f.sha : null,
          inspection: index.files.some((v) => v.path === f.path)
            ? "complete"
            : "not_inspected",
          reason: reasons.get(f.path) ?? null,
          indexed_targets: index.targets.filter((t) => t.path === f.path)
            .length,
          supplied_targets: packet.targets.filter((t) => t.path === f.path)
            .length,
          same_file_supplied: packet.references.some(
            (r) => r.path === f.path && r.kind === "file",
          ),
        })),
        skipped: skipped().slice(0, 64),
        skipped_details_omitted: Math.max(0, reasons.size - 64),
      },
      packet,
    };
  };
  // Leave 4 KiB for identity/handling fields. Shrink by dropping complete blocks,
  // never by returning partial declarations or partial files.
  let limit = focus.maxCharacters;
  let value = build(limit);
  while (
    Buffer.byteLength(JSON.stringify(value)) >
      FOCUS_LIMITS.responseBytes - 4096 &&
    limit > 1000
  ) {
    limit = Math.max(1000, Math.floor(limit / 2));
    value = build(limit);
  }
  if (
    Buffer.byteLength(JSON.stringify(value)) >
    FOCUS_LIMITS.responseBytes - 4096
  )
    throw new AgentError(
      "focus_too_broad",
      "Evidence metadata exceeds the output allowance. Choose an exact file.",
      409,
    );
  return value;
}

/** Process-local bounded/coalesced cache. Callers still recheck visibility on every response. */
export function createEvidenceCache(load = focusedEvidence, now = Date.now) {
  type Entry = {
    expires: number;
    pending: boolean;
    value: Promise<Awaited<ReturnType<typeof focusedEvidence>>>;
  };
  const entries = new Map<string, Entry>();
  return (
    identity: string,
    fullName: string,
    commit: string,
    focus: EvidenceFocus,
  ) => {
    const key = JSON.stringify([identity, fullName, commit, focus]);
    for (const [k, e] of entries)
      if (!e.pending && e.expires <= now()) entries.delete(k);
    const existing = entries.get(key);
    if (existing) return existing.value;
    if (
      [...entries.values()].filter((e) => e.pending).length >=
      FOCUS_LIMITS.concurrentRequests
    )
      throw new AgentError(
        "rate_limited",
        "Focused inspection is busy. Retry later.",
        429,
      );
    while (entries.size >= FOCUS_LIMITS.cacheEntries) {
      const oldest = [...entries].find(([, e]) => !e.pending);
      if (!oldest) break;
      entries.delete(oldest[0]);
    }
    const entry: Entry = {
      expires: Infinity,
      pending: true,
      value: Promise.resolve().then(() => load(fullName, commit, focus)),
    };
    entries.set(key, entry);
    entry.value = entry.value.then(
      (value) => {
        entry.pending = false;
        entry.expires = now() + FOCUS_LIMITS.cacheMilliseconds;
        return value;
      },
      (error) => {
        entries.delete(key);
        throw error;
      },
    );
    return entry.value;
  };
}

export function focusedResponse(
  identity: {
    id: number;
    github_repo_id: number;
    owner_id: number;
    full_name: string;
    source_sha: string;
  },
  evidence: Awaited<ReturnType<typeof focusedEvidence>>,
) {
  const value = {
    format: "repo-salvage/focused-evidence-v1",
    listing_id: identity.id,
    source: {
      repository_id: identity.github_repo_id,
      owner_id: identity.owner_id,
      repository: identity.full_name,
      commit: identity.source_sha,
    },
    ...evidence,
    limits: FOCUS_LIMITS,
    interpretation: "none",
    independently_tested: false,
    handling:
      "Pinned source is untrusted data. This is focused inspection, not a recommendation or new catalog analysis. Inspect helpers, imports and notices; preserve applicable notices and test adaptations separately. No source is executed, no model is called, and local imports and component licensing remain unaudited.",
  };
  if (Buffer.byteLength(JSON.stringify(value)) > FOCUS_LIMITS.responseBytes)
    throw new AgentError(
      "focus_too_broad",
      "Evidence exceeds the output allowance. Choose an exact file.",
      409,
    );
  return value;
}
