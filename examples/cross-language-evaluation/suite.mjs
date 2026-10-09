import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { loadEngine } from "./engine.mjs";
import { hydrateControls } from "../competing-discovery-evaluation/suite.mjs";
export const directory = import.meta.dirname,
  root = path.resolve(directory, "../..");
export const sha256 = (b) => createHash("sha256").update(b).digest("hex");
export const read = async (name) =>
  JSON.parse(await fs.readFile(path.join(directory, name), "utf8"));
export async function verifySeal(name) {
  const bytes = await fs.readFile(path.join(directory, name));
  const seal = JSON.parse(bytes);
  for (const [file, digest] of Object.entries(seal.files))
    if (sha256(await fs.readFile(path.resolve(directory, file))) !== digest)
      throw Error("Frozen trial changed: " + file);
  return { seal, bytes };
}
export async function loadSuite() {
  const { seal, bytes } = await verifySeal("seal.json");
  const [corpus, suite, controls, requests] = await Promise.all(
    ["corpus.json", "cases.json", "controls.json", "requests.json"].map(read),
  );
  if (
    corpus.repositories.length !== 4 ||
    suite.cases.length !== 6 ||
    new Set(suite.cases.map((c) => c.id)).size !== 6
  )
    throw Error("Invalid trial scope");
  for (const r of corpus.repositories) {
    if (
      r.metadata.license !== "MIT" ||
      r.metadata.private ||
      r.metadata.fork ||
      !/^[a-f0-9]{40}$/.test(r.commit)
    )
      throw Error("Invalid provenance");
    for (const f of r.files) {
      const b = Buffer.from(f.content);
      if (
        f.truncated ||
        sha256(b) !== f.sha256 ||
        createHash("sha1")
          .update(Buffer.concat([Buffer.from(`blob ${b.length}\0`), b]))
          .digest("hex") !== f.blobSha
      )
        throw Error("Invalid pinned source");
    }
  }
  const hydrated = hydrateControls(controls, corpus);
  for (const c of suite.cases)
    for (const key of c.requiredEvidence) {
      const source = hydrated.sources.find((s) => s.key === key),
        fragments = controls.cases.find((r) => r.id === c.id)?.fragments[key];
      if (
        !source ||
        !fragments?.length ||
        !fragments.every((f) => f && source.content.includes(f))
      )
        throw Error("Unscorable evidence");
    }
  const engine = await loadEngine({ historical: true });
  try {
    const analyses = corpus.repositories.map((r) => {
      const index = engine.indexSources(r.files, r.knownPaths, r.skipped);
      index.inspection = r.inspection;
      const packet = engine.evidencePacket(index),
        request = engine.indexedAnalysisRequest(
          { full_name: r.repo },
          packet,
          null,
        );
      request.model = "selected-explicitly-at-run";
      const frozen = requests.cases.find((c) => c.repository === r.repo);
      if (
        !frozen ||
        JSON.stringify(frozen.request) !== JSON.stringify(request) ||
        sha256(JSON.stringify(request)) !== frozen.requestSha256
      )
        throw Error("Frozen request mismatch");
      return {
        repository: r.repo,
        index,
        packet,
        request,
        requestSha256: frozen.requestSha256,
      };
    });
    return {
      suite,
      corpus,
      controls: hydrated,
      analyses,
      seal,
      sealBytes: bytes,
    };
  } finally {
    await engine.close();
  }
}
export async function loadGenerated() {
  const s = await loadSuite();
  const g = await verifySeal("generated-seal.json");
  const [listings, catalog, analysis] = await Promise.all(
    ["listings.json", "catalog.json", "analysis-results.json"].map(read),
  );
  if (
    g.seal.inputSealSha256 !== sha256(s.sealBytes) ||
    analysis.inputSealSha256 !== sha256(s.sealBytes) ||
    listings.length !== 4 ||
    catalog.catalog_revision !== g.seal.catalogRevision
  )
    throw Error("Generated provenance changed");
  const archive = await read("history/mcp.json"),
    archiveBytes = Buffer.from(archive.base64, "base64");
  if (sha256(archiveBytes) !== g.seal.archiveSha256)
    throw Error("MCP archive changed");
  return {
    ...s,
    catalog,
    listings,
    analysis,
    seal: g.seal,
    sealBytes: g.bytes,
    archiveBytes,
  };
}
