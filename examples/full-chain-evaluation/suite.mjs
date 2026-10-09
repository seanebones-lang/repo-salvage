/** Frozen source and request validation; target source is never imported. */
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { loadEngine } from "../analysis-evaluation/engine.mjs";
export const directory = fileURLToPath(new URL("./", import.meta.url));
export const root = fileURLToPath(new URL("../../", import.meta.url));
export const sha256 = (b) => createHash("sha256").update(b).digest("hex");
export const read = async (name) =>
  JSON.parse(await fs.readFile(new URL(name, import.meta.url), "utf8"));
export async function loadSuite() {
  const seal = await read("seal.json");
  for (const [name, digest] of Object.entries(seal.files))
    if (sha256(await fs.readFile(new URL(name, import.meta.url))) !== digest)
      throw Error("Frozen input changed: " + name);
  const corpus = await read("corpus.json");
  if (
    corpus.metadata.private ||
    corpus.metadata.fork ||
    corpus.metadata.license !== "MIT" ||
    !/^[a-f0-9]{40}$/.test(corpus.commit)
  )
    throw Error("Invalid source provenance.");
  for (const f of corpus.files) {
    const b = Buffer.from(f.content);
    if (
      f.truncated ||
      createHash("sha1")
        .update(Buffer.concat([Buffer.from(`blob ${b.length}\0`), b]))
        .digest("hex") !== f.blobSha
    )
      throw Error("Invalid complete source blob.");
  }
  const engine = await loadEngine();
  try {
    const index = engine.indexSources(
      corpus.files,
      corpus.knownPaths,
      corpus.skipped,
    );
    index.inspection = corpus.inspection;
    const packet = engine.evidencePacket(index);
    const request = engine.indexedAnalysisRequest(
      { full_name: corpus.repo },
      packet,
      null,
    );
    request.model = "selected-explicitly-at-run";
    if (JSON.stringify(request) !== JSON.stringify(await read("request.json")))
      throw Error("Production request drift; stop before model use.");
    const c = await read("controls.json"),
      primary = corpus.files.find((f) => f.path === c.path),
      notice = corpus.files.find((f) => f.path === c.noticePath);
    if (
      !primary ||
      !notice ||
      c.repository !== corpus.repo ||
      c.commit !== corpus.commit ||
      !c.fragments.every((f) => primary.content.includes(f))
    )
      throw Error("Invalid source controls.");
    return {
      seal,
      corpus,
      index,
      packet,
      request,
      task: await read("task.json"),
      control: c,
      controls: {
        sources: [
          {
            ...c,
            content: primary.content,
            blobSha: primary.blobSha,
            sha256: sha256(primary.content),
            notice: {
              path: notice.path,
              content: notice.content,
              sha256: sha256(notice.content),
            },
          },
        ],
        cases: [
          { id: "bounded-recent-cache", fragments: { [c.key]: c.fragments } },
        ],
      },
    };
  } finally {
    await engine.close();
  }
}
export async function loadGenerated() {
  const suite = await loadSuite(),
    generated = await read("generated-seal.json");
  for (const [name, digest] of Object.entries(generated.files))
    if (sha256(await fs.readFile(new URL(name, import.meta.url))) !== digest)
      throw Error("Generated record changed: " + name);
  if (
    generated.inputSealSha256 !==
    sha256(await fs.readFile(new URL("seal.json", import.meta.url)))
  )
    throw Error("Generated record has different inputs.");
  const response = await read("analysis-response.json"),
    summary = await read("summary.json");
  const e = await loadEngine();
  try {
    if (
      JSON.stringify(
        e.verifiedIndexedSummary(
          JSON.stringify(response),
          suite.index,
          suite.packet,
        ),
      ) !== JSON.stringify(summary)
    )
      throw Error("Generated summary is not the verified response.");
  } finally {
    await e.close();
  }
  return { ...suite, summary, generated };
}
