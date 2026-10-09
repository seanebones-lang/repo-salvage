/** Operator-only freeze. Captures are data; no target modules are loaded. */
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { loadEngine } from "../analysis-evaluation/engine.mjs";
const directory = new URL("./", import.meta.url);
const sha256 = (b) => createHash("sha256").update(b).digest("hex");
if (process.argv[2] !== "--freeze" || process.argv.length !== 3)
  throw Error("Explicit --freeze required");
if (await fs.stat(new URL("input-seal.json", directory)).catch(() => null))
  throw Error("Epoch already frozen");
const old = JSON.parse(
  await fs.readFile(
    new URL("../cross-language-evaluation/corpus.json", directory),
    "utf8",
  ),
);
const cases = [
  {
    id: "rust",
    repository: "rapidfuzz/strsim-rs",
    path: "src/lib.rs",
    symbol: "levenshtein",
    max_characters: 12000,
    listing_id: 991,
  },
  {
    id: "go",
    repository: "dgryski/go-rendezvous",
    path: "rdv.go",
    symbol: "Rendezvous.Lookup",
    max_characters: 6000,
    listing_id: 992,
  },
];
const corpus = {
  format: "repo-salvage/rust-go-corpus-v1",
  repositories: cases.map((c) => {
    const r = old.repositories.find((r) => r.repo === c.repository);
    return {
      ...r,
      files: r.files.filter((f) =>
        [c.path, "LICENSE", "Cargo.toml"].includes(f.path),
      ),
    };
  }),
};
const engine = await loadEngine(),
  priorFetch = globalThis.fetch;
try {
  for (const c of cases) {
    const r = corpus.repositories.find((r) => r.repo === c.repository);
    globalThis.fetch = async (url) => {
      if (String(url).includes("/git/trees/"))
        return new Response(
          JSON.stringify({
            tree: r.files.map((f) => ({
              path: f.path,
              type: "blob",
              mode: "100644",
              sha: f.blobSha,
              size: Buffer.byteLength(f.content),
            })),
          }),
        );
      const f = r.files.find((f) => String(url).endsWith("/" + f.path));
      if (!f) throw Error("Unexpected pinned read");
      return new Response(f.content);
    };
    const response = engine.focusedResponse(
      {
        id: c.listing_id,
        github_repo_id: r.metadata.id,
        owner_id: r.metadata.owner_id ?? 99101,
        full_name: r.repo,
        source_sha: r.commit,
      },
      await engine.focusedEvidence(r.repo, r.commit, {
        path: c.path,
        symbol: c.symbol,
        maxCharacters: c.max_characters,
      }),
    );
    await fs.writeFile(
      new URL(c.id + "/evidence.json", directory),
      JSON.stringify(response, null, 2) + "\n",
      { flag: "wx" },
    );
    await fs.writeFile(
      new URL(c.id + "/LICENSE", directory),
      r.files.find((f) => f.path === "LICENSE").content,
      { flag: "wx" },
    );
  }
  await fs.writeFile(
    new URL("cases.json", directory),
    JSON.stringify(cases, null, 2) + "\n",
    { flag: "wx" },
  );
  await fs.writeFile(
    new URL("corpus.json", directory),
    JSON.stringify(corpus, null, 2) + "\n",
    { flag: "wx" },
  );
  const names = [
    "freeze.mjs",
    "proposal.mjs",
    "check.mjs",
    "cases.json",
    "corpus.json",
    "rust/task.txt",
    "rust/acceptance.rs",
    "rust/evidence.json",
    "rust/LICENSE",
    "go/task.txt",
    "go/consumer_test.go",
    "go/go.mod",
    "go/evidence.json",
    "go/LICENSE",
  ];
  const inputs = [];
  for (const path of names)
    inputs.push({
      path,
      sha256: sha256(await fs.readFile(new URL(path, directory))),
    });
  // Application/grammar checksums identify the generator used for this freeze.
  const generator = [];
  for (const path of [
    "src/lib/source-index.ts",
    "src/lib/focused-evidence.ts",
    "scripts/syntax-index.mjs",
    "scripts/grammars/manifest.json",
    "scripts/grammars/tree-sitter-go.wasm",
    "scripts/grammars/tree-sitter-rust.wasm",
    "package-lock.json",
  ])
    generator.push({
      path,
      sha256: sha256(await fs.readFile(new URL("../../" + path, directory))),
    });
  await fs.writeFile(
    new URL("input-seal.json", directory),
    JSON.stringify(
      {
        format: "repo-salvage/rust-go-consumer-input-v1",
        frozenAt: new Date().toISOString(),
        scope:
          "Operator-authored cases; acceptance hidden from tool-free first proposals. Reused pinned MIT sources. No blind review or upstream certification.",
        inputs,
        generator,
      },
      null,
      2,
    ) + "\n",
    { flag: "wx" },
  );
} finally {
  globalThis.fetch = priorFetch;
  await engine.close();
}
