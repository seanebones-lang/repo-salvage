/** Replay previously captured commit-pinned bytes; no network or target execution. */
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { loadEngine, root } from "../analysis-evaluation/engine.mjs";
export const sha = (b) => createHash("sha256").update(b).digest("hex");
export async function evidence(language) {
  const captureBytes = await fs.readFile(
    new URL("../native-file-context/pinned.json", import.meta.url),
  );
  const seal = JSON.parse(
    await fs.readFile(
      new URL("../native-file-context/pinned-seal.json", import.meta.url),
      "utf8",
    ),
  );
  if (sha(captureBytes) !== seal.sha256) throw Error("Source capture changed");
  const c = JSON.parse(captureBytes).cases.find(
    (c) => c.id === (language === "rust" ? "itoa" : "xxhash"),
  );
  const previous = process.cwd(),
    fetch = globalThis.fetch,
    engine = await loadEngine();
  try {
    process.chdir(root);
    globalThis.fetch = async (url) => {
      const r = c.requests.find((r) => r.url === String(url));
      if (!r || sha(r.body) !== r.sha256) throw Error("Unretained source read");
      return new Response(r.body);
    };
    return engine.focusedResponse(
      {
        id: c.listing_id,
        github_repo_id: c.github_repo_id,
        owner_id: c.owner_id,
        full_name: c.repo,
        source_sha: c.commit,
      },
      await engine.focusedEvidence(c.repo, c.commit, {
        path: c.path,
        symbol: language === "rust" ? "div_rem_1e16" : c.symbol,
        maxCharacters: 24000,
      }),
    );
  } finally {
    process.chdir(previous);
    globalThis.fetch = fetch;
    await engine.close();
  }
}
if (process.argv[2] === "--capture")
  for (const language of ["rust", "go"]) {
    const response = await evidence(language);
    await fs.writeFile(
      new URL(language + "/evidence.json", import.meta.url),
      JSON.stringify(response, null, 2) + "\n",
      { flag: "wx" },
    );
    console.log(
      language,
      response.packet.references.map((r) => [
        r.id,
        r.path,
        r.kind,
        r.content.length,
      ]),
    );
  }
