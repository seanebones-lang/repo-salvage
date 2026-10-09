/** One-time pinned read-only capture. Regenerate a new epoch rather than replace retained evidence. */
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { loadEngine, root } from "../analysis-evaluation/engine.mjs";
const dir = new URL("./", import.meta.url),
  engine = await loadEngine(),
  prior = globalThis.fetch;
process.chdir(root);
const cases = [
  {
    id: "witness",
    listing_id: 9,
    github_repo_id: 1370193955,
    owner_id: 227504642,
    repo: "seanebones-lang/witness",
    commit: "482ce52011d55c4991cd7dc73fa103c9527c43ab",
    license: "MPL-2.0",
    path: "core/src/lib.rs",
    symbol: "Result",
    max_characters: 24000,
  },
  {
    id: "xxhash",
    listing_id: 995,
    github_repo_id: 66737655,
    owner_id: 318501,
    repo: "cespare/xxhash",
    commit: "ab37246c889f9db16b606fda1c232d659df9271d",
    license: "MIT",
    path: "xxhash.go",
    symbol: "Digest.Write",
    max_characters: 24000,
  },
];
cases.push({
  id: "itoa",
  listing_id: 996,
  github_repo_id: 61962375,
  owner_id: 1940490,
  repo: "dtolnay/itoa",
  commit: "1577ed901354d0d7448ac162328f9dbf5183124c",
  license: "MIT option in MIT OR Apache-2.0",
  path: "src/lib.rs",
  symbol: "Buffer::new",
  max_characters: 24000,
});
const captures = [];
try {
  for (const c of cases) {
    const requests = [];
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      if (!url.includes(c.commit) || init?.headers?.Authorization)
        throw Error("Unpinned or credentialed source request");
      const response = await prior(input, init);
      if (!response.ok)
        throw Error("Pinned capture unavailable: " + response.status);
      const body = await response.clone().text();
      requests.push({
        url,
        body,
        sha256: createHash("sha256").update(body).digest("hex"),
      });
      return response;
    };
    const response = engine.focusedResponse(
      {
        id: c.listing_id,
        github_repo_id: c.github_repo_id,
        owner_id: c.owner_id,
        full_name: c.repo,
        source_sha: c.commit,
      },
      await engine.focusedEvidence(c.repo, c.commit, {
        path: c.path,
        symbol: c.symbol,
        maxCharacters: c.max_characters,
      }),
    );
    if (
      !response.packet.targets.length ||
      (c.id !== "witness" &&
        !response.packet.file_contexts?.some((c) =>
          c.files.some((f) => f.reason === "supplied"),
        ))
    )
      throw Error("Expected supplied target/file context absent");
    captures.push({ ...c, requests, response });
    console.log(
      JSON.stringify({
        id: c.id,
        reads: requests.length - 1,
        context: response.packet.file_contexts,
        supplied: response.packet.references.map((r) => r.path),
      }),
    );
  }
  const bytes =
    JSON.stringify(
      {
        format: "repo-salvage/pinned-file-context-v1",
        capturedAt: new Date().toISOString(),
        cases: captures,
      },
      null,
      2,
    ) + "\n";
  await fs.writeFile(new URL("pinned.json", dir), bytes, { flag: "wx" });
  await fs.writeFile(
    new URL("pinned-seal.json", dir),
    JSON.stringify(
      {
        format: "repo-salvage/source-capture-seal-v1",
        sha256: createHash("sha256").update(bytes).digest("hex"),
        providerCalls: 0,
        targetCodeExecuted: false,
        syntheticGoListingId: true,
      },
      null,
      2,
    ) + "\n",
    { flag: "wx" },
  );
} finally {
  globalThis.fetch = prior;
  await engine.close();
}
