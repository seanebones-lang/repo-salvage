import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { loadEngine } from "./engine.mjs";
export const directory = fileURLToPath(new URL("./", import.meta.url));
export const sha256 = (b) => createHash("sha256").update(b).digest("hex");
export const read = async (name) =>
  JSON.parse(await fs.readFile(path.join(directory, name), "utf8"));
export async function loadSuite({ production = false } = {}) {
  const seal = await read("seal.json");
  for (const [name, digest] of Object.entries(seal.files))
    if (sha256(await fs.readFile(path.resolve(directory, name))) !== digest)
      throw Error("Frozen trial changed: " + name);
  const corpus = await read("corpus.json"),
    controls = await read("controls.json"),
    requests = await read("requests.json");
  for (const repo of corpus.repositories) {
    if (
      repo.metadata.private ||
      repo.metadata.fork ||
      repo.metadata.license !== "MIT" ||
      !/^[a-f0-9]{40}$/.test(repo.commit)
    )
      throw Error("Invalid corpus provenance.");
    for (const f of repo.files) {
      const b = Buffer.from(f.content);
      if (
        f.truncated ||
        createHash("sha1")
          .update(Buffer.concat([Buffer.from(`blob ${b.length}\0`), b]))
          .digest("hex") !== f.blobSha
      )
        throw Error("Invalid pinned blob.");
    }
  }
  if (production) {
    const archive = await read("history/engine.json");
    for (const m of archive.modules)
      if (
        sha256(
          await fs.readFile(
            new URL("../../src/lib/" + m.name + ".ts", import.meta.url),
          ),
        ) !== m.sha256
      )
        throw Error("Production engine changed before model use.");
    if (
      sha256(
        await fs.readFile(
          new URL("../../scripts/python-index.py", import.meta.url),
        ),
      ) !== archive.parser.sha256
    )
      throw Error("Production parser changed.");
  }
  const engine = await loadEngine(production ? {} : { historical: true });
  try {
    const indexes = new Map(
      corpus.repositories.map((r) => {
        const index = engine.indexSources(r.files, r.knownPaths, r.skipped);
        index.inspection = r.inspection;
        return [r.repo, index];
      }),
    );
    const cases = controls.cases.map((c) => {
      const index = indexes.get(c.repository);
      if (!index) throw Error("Missing controlled repository.");
      const focused = c.path
        ? {
            ...index,
            targets: index.targets.filter(
              (t) => t.path === c.path && t.symbol === c.symbol,
            ),
          }
        : index;
      const packet = engine.evidencePacket(
        focused,
        c.packetCharacters,
        "repo-salvage/coverage-v4",
      );
      const request = engine.indexedAnalysisRequest(
        { full_name: c.repository },
        packet,
        null,
        "scoped-support-v1",
      );
      request.model = "selected-explicitly-at-run";
      const frozen = requests.cases.find((r) => r.id === c.id);
      if (
        !frozen ||
        JSON.stringify(frozen.request) !== JSON.stringify(request) ||
        sha256(JSON.stringify(request)) !== frozen.requestSha256
      )
        throw Error("Frozen request mismatch.");
      const available = packet.targets.map((t) => t.symbol);
      if (!available.includes(c.requiredSymbol))
        throw Error("Required control was not supplied.");
      const target = packet.targets.find((t) => t.symbol === c.requiredSymbol);
      const context = packet.scoped_contexts.find(
        (s) => s.target_id === target.id,
      );
      if (
        !context ||
        !c.supportSymbols.every((name) =>
          context.references.some((r) => r.symbol === name),
        )
      )
        throw Error("Required supporting observation was not supplied.");
      if (
        packet.contexts.find((s) => s.target_id === target.id)
          .same_file_reference !== null
      )
        throw Error("Trial no longer measures partial module context.");
      return {
        ...c,
        index,
        packet,
        request,
        requestSha256: frozen.requestSha256,
      };
    });
    if (cases.length !== 2 || new Set(cases.map((c) => c.id)).size !== 2)
      throw Error("Invalid evaluation scope.");
    return { cases, seal, scope: controls.scope, corpus };
  } finally {
    await engine.close();
  }
}
