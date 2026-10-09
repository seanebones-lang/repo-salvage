import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
export const directory = import.meta.dirname;
export const root = path.resolve(directory, "../..");
export const sha256 = (v) => createHash("sha256").update(v).digest("hex");
export const frozenFiles = [
  "cases.json",
  "corpus.json",
  "controls.json",
  "listings.json",
  "catalog.json",
  "run.mjs",
  "score.mjs",
  "suite.mjs",
  "serve.mjs",
];
export function hydrateControls(controls, corpus) {
  return {
    ...controls,
    sources: controls.sources.map((s) => {
      const r = corpus.repositories.find(
        (r) => r.repo === s.repository && r.commit === s.commit,
      );
      const f = r?.files.find((f) => f.path === s.path);
      const n = r?.files.find((f) => f.path === s.notice.path);
      if (
        !f ||
        !n ||
        f.sha256 !== s.sha256 ||
        f.blobSha !== s.blobSha ||
        n.sha256 !== s.notice.sha256 ||
        n.blobSha !== s.notice.blobSha
      )
        throw Error("Control provenance mismatch.");
      return {
        ...s,
        content: f.content,
        notice: { ...s.notice, content: n.content },
      };
    }),
  };
}
export function validateSources(corpus) {
  if (corpus.repositories.length !== 6)
    throw Error("Expected six competing repositories.");
  for (const r of corpus.repositories) {
    if (r.license !== "MIT" || !/^[a-f0-9]{40}$/.test(r.commit))
      throw Error("Invalid source provenance.");
    for (const f of r.files) {
      const bytes = Buffer.from(f.content);
      if (
        f.truncated ||
        sha256(bytes) !== f.sha256 ||
        createHash("sha1")
          .update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes]))
          .digest("hex") !== f.blobSha
      )
        throw Error("Source is not a complete verified Git blob.");
    }
    if (
      !r.files.some(
        (f) => f.path === "license" && f.content.includes("MIT License"),
      )
    )
      throw Error("Original MIT notice missing.");
  }
}
export async function loadSuite({ archive = false } = {}) {
  const sealBytes = await fs.readFile(path.join(directory, "seal.json"));
  const seal = JSON.parse(sealBytes);
  for (const name of frozenFiles) {
    if (
      sha256(await fs.readFile(path.join(directory, name))) !==
      seal.files.find((f) => f.name === name)?.sha256
    )
      throw Error("Frozen epoch changed: " + name);
  }
  const read = async (n) =>
    JSON.parse(await fs.readFile(path.join(directory, n), "utf8"));
  const [suite, corpus, controls, catalog] = await Promise.all([
    read("cases.json"),
    read("corpus.json"),
    read("controls.json"),
    read("catalog.json"),
  ]);
  validateSources(corpus);
  const hydrated = hydrateControls(controls, corpus);
  if (
    suite.cases.length !== 10 ||
    new Set(suite.cases.map((c) => c.id)).size !== 10 ||
    catalog.pagination.total !== 40 ||
    catalog.catalog_revision !== seal.catalogRevision
  )
    throw Error("Invalid frozen scope.");
  for (const c of suite.cases) {
    const rule = controls.cases.find((r) => r.id === c.id);
    if (
      !rule ||
      !c.requiredEvidence.length ||
      !c.requiredEvidence.every((key) => {
        const source = hydrated.sources.find((s) => s.key === key);
        return (
          source &&
          rule.fragments[key]?.length &&
          rule.fragments[key].every((f) => f && source.content.includes(f))
        );
      })
    )
      throw Error("Unscorable evidence rubric.");
  }
  const archiveBytes = archive
    ? await fs.readFile(path.join(root, "public/repo-salvage-mcp.tgz"))
    : null;
  if (archive && sha256(archiveBytes) !== seal.archiveSha256)
    throw Error("MCP package changed before model use.");
  return {
    suite,
    corpus,
    controls: hydrated,
    catalog,
    seal,
    sealBytes,
    archiveBytes,
  };
}
