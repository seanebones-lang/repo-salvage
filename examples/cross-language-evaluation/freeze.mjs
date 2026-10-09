/** Freeze once before each model phase; captured repositories remain data. */
import fs from "node:fs/promises";
import path from "node:path";
import { loadEngine } from "./engine.mjs";
import { directory, read, sha256, loadSuite } from "./suite.mjs";
const [phase, origin] = process.argv.slice(2);
if (
  !["--inputs", "--catalog"].includes(phase) ||
  process.argv.length !== (phase === "--inputs" ? 3 : 4)
)
  throw Error(
    "Use --inputs before analyses, --catalog LOOPBACK_ORIGIN before discovery",
  );
const dest = phase === "--inputs" ? "seal.json" : "generated-seal.json";
if (await fs.stat(path.join(directory, dest)).catch(() => null))
  throw Error("Epoch already frozen; create a new epoch");
const sealFiles = async (names) =>
  Object.fromEntries(
    await Promise.all(
      names.map(async (name) => [
        name,
        sha256(await fs.readFile(path.resolve(directory, name))),
      ]),
    ),
  );
const put = (name, data) =>
  fs.writeFile(
    path.join(directory, name),
    JSON.stringify(data, null, 2) + "\n",
    { flag: "wx" },
  );
if (phase === "--inputs") {
  const corpus = await read("corpus.json"),
    engine = await loadEngine({ historical: true });
  const cases = [];
  try {
    for (const r of corpus.repositories) {
      const index = engine.indexSources(r.files, r.knownPaths, r.skipped);
      index.inspection = r.inspection;
      const packet = engine.evidencePacket(index);
      const request = engine.indexedAnalysisRequest(
        { full_name: r.repo },
        packet,
        null,
      );
      request.model = "selected-explicitly-at-run";
      cases.push({
        repository: r.repo,
        request,
        requestSha256: sha256(JSON.stringify(request)),
        coverage: {
          targets: packet.targets.map((t) => ({
            path: t.path,
            symbol: t.symbol,
            kind: t.kind,
          })),
          referencePaths: packet.references.map((r) => r.path),
          packetCharacters: JSON.stringify(packet).length,
        },
      });
    }
  } finally {
    await engine.close();
  }
  await put("requests.json", {
    format: "repo-salvage/cross-language-requests-v1",
    cases,
  });
  const files = await sealFiles([
    "corpus.json",
    "controls.json",
    "cases.json",
    "requests.json",
    "engine.mjs",
    "suite.mjs",
    "run.mjs",
    "freeze.mjs",
    "serve.mjs",
    "history/engine.json",
    "history/seal.json",
    "../full-chain-evaluation/run.mjs",
    "../analysis-evaluation/trace.mjs",
    "../competing-discovery-evaluation/host.mjs",
    "../competing-discovery-evaluation/score.mjs",
    "../competing-discovery-evaluation/suite.mjs",
    "../discovery-evaluation/trace.mjs",
  ]);
  await put(dest, {
    format: "repo-salvage/cross-language-input-seal-v1",
    files,
  });
  await loadSuite();
  console.log(
    "Frozen four exact captured production requests and six authored discovery tasks before model use.",
  );
} else {
  if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin) || origin.endsWith(":3187"))
    throw Error("Separate loopback origin required");
  const s = await loadSuite(),
    res = await fetch(origin + "/api/v2/parts?limit=50", {
      signal: AbortSignal.timeout(30000),
      redirect: "error",
    });
  if (!res.ok) throw Error("Production catalog unavailable");
  const catalog = await res.json();
  const listings = await read("listings.json");
  const expected = listings.reduce(
    (n, r) => n + JSON.parse(r.summary_json).reusable_pieces.length,
    0,
  );
  if (catalog.pagination.total !== expected)
    throw Error("Catalog part count mismatch");
  await put("catalog.json", catalog);
  const archive = await read("history/mcp.json"),
    bytes = Buffer.from(archive.base64, "base64");
  await put(dest, {
    format: "repo-salvage/cross-language-catalog-seal-v1",
    inputSealSha256: sha256(s.sealBytes),
    archiveSha256: sha256(bytes),
    catalogRevision: catalog.catalog_revision,
    files: await sealFiles([
      "analysis-results.json",
      "listings.json",
      "catalog.json",
      "history/mcp.json",
    ]),
  });
  console.log(
    "Frozen untouched generated listings, production catalog and MCP package before discovery.",
  );
}
