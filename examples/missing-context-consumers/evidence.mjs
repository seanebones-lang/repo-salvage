/** Authored fixture replay through the current production engine; no source network or execution. */
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { loadEngine, root } from "../analysis-evaluation/engine.mjs";
export const directory = new URL("./", import.meta.url);
export const sha = (b) => createHash("sha256").update(b).digest("hex");
export const read = async (p) =>
  JSON.parse(await fs.readFile(new URL(p, directory), "utf8"));
export async function evidence(id) {
  const corpus = await read("corpus.json"),
    c = corpus.cases.find((c) => c.id === id);
  if (!c) throw Error("Unknown case");
  const prior = globalThis.fetch,
    previous = process.cwd(),
    engine = await loadEngine(),
    requests = [];
  try {
    process.chdir(root);
    globalThis.fetch = async (input) => {
      const url = String(input);
      requests.push(url);
      if (
        url ===
        `https://api.github.com/repos/${c.repo}/git/trees/${c.commit}?recursive=1`
      )
        return new Response(
          JSON.stringify({
            tree: Object.entries(c.files).map(([path, content]) => ({
              path,
              type: "blob",
              mode: "100644",
              size: Buffer.byteLength(content),
              sha: createHash("sha1")
                .update(`blob ${Buffer.byteLength(content)}\0`)
                .update(content)
                .digest("hex"),
            })),
          }),
        );
      const prefix = `https://raw.githubusercontent.com/${c.repo}/${c.commit}/`,
        file = url.startsWith(prefix)
          ? c.files[url.slice(prefix.length)]
          : undefined;
      if (file === undefined) throw Error("Unexpected fixture read: " + url);
      return new Response(file);
    };
    const response = engine.focusedResponse(
      {
        id: c.listing_id,
        github_repo_id: 999,
        owner_id: 99,
        full_name: c.repo,
        source_sha: c.commit,
      },
      await engine.focusedEvidence(c.repo, c.commit, {
        path: c.path,
        symbol: c.symbol,
        maxCharacters: c.max_characters,
      }),
    );
    return { response, requests };
  } finally {
    globalThis.fetch = prior;
    process.chdir(previous);
    await engine.close();
  }
}
if (process.argv[2] === "--capture")
  for (const c of (await read("corpus.json")).cases) {
    const { response, requests } = await evidence(c.id);
    await fs.writeFile(
      new URL(c.id + "/evidence.json", directory),
      JSON.stringify(response, null, 2) + "\n",
      { flag: "wx" },
    );
    await fs.writeFile(
      new URL(c.id + "/reads.json", directory),
      JSON.stringify(requests, null, 2) + "\n",
      { flag: "wx" },
    );
    console.log(c.id, JSON.stringify(response.packet.file_contexts));
  }
