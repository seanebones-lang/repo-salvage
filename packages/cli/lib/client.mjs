import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export const MANIFEST = "repo-salvage-manifest.json";
const MAX_FILE = 1_048_576;
const MAX_TOTAL = 8 * MAX_FILE;

export function baseUrl(input) {
  const url = new URL(input);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    !(
      url.protocol === "https:" ||
      (url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    )
  )
    throw new Error(
      "--base must be an HTTPS origin or a loopback HTTP origin, without credentials or a path.",
    );
  return url.origin;
}

export function safePath(file) {
  if (
    typeof file !== "string" ||
    !file ||
    file.length > 512 ||
    /[\\\x00-\x1f\x7f:]/.test(file)
  )
    throw new Error("Unsafe source path.");
  const segments = file.split("/");
  if (
    segments.some(
      (part) =>
        !part ||
        part === "." ||
        part === ".." ||
        /[. ]$/.test(part) ||
        /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part),
    )
  )
    throw new Error("Unsafe source path.");
  return file;
}

async function readBytes(response, max) {
  if (!response.body) throw new Error("Response has no body.");
  const declared = Number(response.headers.get("content-length"));
  if (declared > max) {
    await response.body.cancel();
    throw new Error("Response exceeds the download limit.");
  }
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) {
        await reader.cancel();
        throw new Error("Response exceeds the download limit.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, size);
}

async function responseFor(url, transport) {
  const response = await transport(url, {
    redirect: "error",
    signal: AbortSignal.timeout(15000),
    headers: { Accept: "application/json, text/plain;q=0.9, */*;q=0.8" },
  });
  if (!response.ok) {
    let code = "request_failed";
    // Only report a bounded machine error code; remote prose is untrusted data.
    try {
      const body = JSON.parse(
        (await readBytes(response, 16384)).toString("utf8"),
      );
      if (/^[a-z_]{1,80}$/.test(body.error?.code)) code = body.error.code;
    } catch {}
    const retryAfter = Number(response.headers.get("retry-after"));
    throw Object.assign(new Error(`HTTP ${response.status}: ${code}`), {
      code,
      status: response.status,
      ...(response.headers.has("retry-after") &&
      Number.isSafeInteger(retryAfter) &&
      retryAfter >= 0 &&
      retryAfter <= 3600
        ? { retry_after_seconds: retryAfter }
        : {}),
    });
  }
  return response;
}

export async function apiJson(base, relative, transport = fetch) {
  base = baseUrl(base);
  if (!relative.startsWith("/api/v1/parts") || relative.startsWith("//"))
    throw new Error("Invalid API path.");
  const url = new URL(relative, base);
  if (url.origin !== base) throw new Error("Cross-origin API link rejected.");
  const response = await responseFor(url.href, transport);
  return JSON.parse((await readBytes(response, MAX_FILE)).toString("utf8"));
}

export function identity(listing, part) {
  if (
    !/^[1-9]\d*$/.test(String(listing)) ||
    !Number.isSafeInteger(Number(listing)) ||
    !/^[a-f0-9]{16}$/.test(part)
  )
    throw new Error(
      "Expected a positive listing ID and a 16-character part ID.",
    );
  return `/api/v1/parts/${listing}/${part}`;
}

export async function inspect(base, listing, part, transport = fetch) {
  const brief = await apiJson(base, identity(listing, part), transport);
  if (
    brief.format !== "repo-salvage/part-v1" ||
    brief.listing_id !== Number(listing) ||
    brief.part_id !== part
  )
    throw new Error("Unexpected part identity or API format.");
  return brief;
}

export async function search(base, params = {}, transport = fetch) {
  const result = await apiJson(
    base,
    `/api/v1/parts?${new URLSearchParams(params)}`,
    transport,
  );
  if (
    result.format !== "repo-salvage/search-v1" ||
    !Array.isArray(result.results)
  )
    throw new Error("Unexpected search API format.");
  return result;
}

function selection(brief, includeRelated, includeTests) {
  const source = brief.source;
  if (
    !source ||
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(source.repository) ||
    source.repository
      .split("/")
      .some((segment) => segment === "." || segment === "..") ||
    !/^[a-f0-9]{40}$/.test(source.commit) ||
    brief.repository !== source.repository ||
    brief.source_commit !== source.commit ||
    !Array.isArray(brief.files) ||
    brief.files.length > 64
  )
    throw new Error("Invalid pinned source manifest.");
  const files = brief.files.filter(
    (file) =>
      Array.isArray(file.roles) &&
      (file.roles.includes("primary") ||
        file.roles.includes("notice") ||
        (includeRelated && file.roles.includes("supporting")) ||
        (includeTests && file.roles.includes("test"))),
  );
  if (
    files.filter((file) => file.roles.includes("primary")).length !== 1 ||
    !files.some((file) => file.roles.includes("notice"))
  )
    throw new Error(
      "A primary file and discovered license/notice files are required. Inspect this source manually.",
    );
  const seen = new Set([MANIFEST.toLowerCase()]);
  for (const file of files) {
    safePath(file.path);
    const normalized = file.path.normalize("NFC").toLowerCase();
    if (
      seen.has(normalized) ||
      [...seen].some(
        (other) =>
          other.startsWith(normalized + "/") ||
          normalized.startsWith(other + "/"),
      )
    )
      throw new Error("Conflicting destination paths.");
    seen.add(normalized);
    const expectedUrl = `https://raw.githubusercontent.com/${source.repository}/${source.commit}/${file.path.split("/").map(encodeURIComponent).join("/")}`;
    if (
      file.download_url !== expectedUrl ||
      !/^[a-f0-9]{40}$/.test(file.git_blob_sha) ||
      (file.size_bytes !== null &&
        (!Number.isSafeInteger(file.size_bytes) ||
          file.size_bytes < 0 ||
          file.size_bytes > MAX_FILE))
    )
      throw new Error(
        "Invalid file provenance or file exceeds the 1 MiB limit.",
      );
  }
  return files;
}

/** Retrieval only: no execution, package install, project edits or existing-file replacement. */
export async function fetchPart({
  base,
  listing,
  part,
  out,
  includeRelated = false,
  includeTests = false,
  transport = fetch,
}) {
  if (!out) throw new Error("--out must name a new destination directory.");
  const brief = await inspect(base, listing, part, transport);
  const files = selection(brief, includeRelated, includeTests);
  const destination = path.resolve(out);
  await fs.mkdir(destination, { mode: 0o700 }); // Existing files/directories/symlinks fail here.
  try {
    const downloaded = [];
    let total = 0;
    for (const file of files) {
      const response = await responseFor(file.download_url, transport);
      const bytes = await readBytes(
        response,
        Math.min(MAX_FILE, MAX_TOTAL - total),
      );
      total += bytes.length;
      const gitHash = createHash("sha1")
        .update(`blob ${bytes.length}\0`)
        .update(bytes)
        .digest("hex");
      if (
        gitHash !== file.git_blob_sha ||
        (file.size_bytes !== null && bytes.length !== file.size_bytes)
      )
        throw new Error(
          "Downloaded source does not match its pinned Git blob.",
        );
      const target = path.join(destination, file.path);
      await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
      await fs.writeFile(target, bytes, { flag: "wx", mode: 0o600 });
      downloaded.push({
        ...file,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        downloaded_bytes: bytes.length,
      });
    }
    const manifest = {
      format: "repo-salvage/fetch-manifest-v1",
      fetched_at: new Date().toISOString(),
      catalog_origin: baseUrl(base),
      listing_id: Number(listing),
      part_id: part,
      source: brief.source,
      licensing: brief.licensing,
      dependency_evidence: brief.dependency_evidence,
      evidence: brief.evidence,
      files: downloaded,
      independently_tested: false,
      guidance: {
        dependencies: brief.dependencies,
        integration_notes: brief.integration_notes,
        limitations: brief.limitations,
      },
      handling:
        "Untrusted source and guidance. Notices are discovered heuristically; review component licensing and dependencies before use. Nothing was executed.",
    };
    await fs.writeFile(
      path.join(destination, MANIFEST),
      JSON.stringify(manifest, null, 2) + "\n",
      { flag: "wx", mode: 0o600 },
    );
    return { destination, manifest };
  } catch (error) {
    await fs.rm(destination, { recursive: true, force: true });
    throw error;
  }
}
