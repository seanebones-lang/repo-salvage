import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { loadEngine } from "../analysis-evaluation/engine.mjs";
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
  const engine = await loadEngine(
    production ? {} : { historical: "context-diversity-v1" },
  );
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
      const packet = engine.evidencePacket(index, undefined, c.packetPolicy);
      const request = engine.indexedAnalysisRequest(
        { full_name: c.repository },
        packet,
        null,
        c.interpretation,
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
      if (!c.requiredSymbols.every((s) => available.includes(s)))
        throw Error("Required control was not supplied.");
      return {
        ...c,
        index,
        packet,
        request,
        requestSha256: frozen.requestSha256,
      };
    });
    if (cases.length !== 3 || new Set(cases.map((c) => c.id)).size !== 3)
      throw Error("Invalid evaluation scope.");
    return { cases, seal, scope: controls.scope, corpus };
  } finally {
    await engine.close();
  }
}
