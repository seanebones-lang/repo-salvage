/** Disposable HTTP fixture using the current production evidence engine and mocked pinned Git reads.
 * Does not exercise database visibility/auth routes. Fixture source is parser data only.
 */
import http from "node:http";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { loadEngine, root } from "../analysis-evaluation/engine.mjs";
export const directory = new URL("./", import.meta.url);
export const sha = (b) => createHash("sha256").update(b).digest("hex");
export const read = async (p) =>
  JSON.parse(await fs.readFile(new URL(p, directory), "utf8"));
export async function focusCase(id, params) {
  const c = (await read("corpus.json")).cases.find((c) => c.id === id);
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
        p = url.startsWith(prefix) ? url.slice(prefix.length) : null;
      if (!p || c.files[p] === undefined)
        throw Error("Unexpected fixture read");
      const helper = c.language === "go" ? "z_helper.go" : "src/helper.rs";
      return new Response(
        c.files[p] +
          (c.corruptHelper && p === helper
            ? "\n// corrupt transport bytes\n"
            : ""),
      );
    };
    const query = new URLSearchParams({
      path: params.path,
      max_characters: String(params.maxCharacters),
    });
    if (params.symbol) query.set("symbol", params.symbol);
    const focus = engine.evidenceFocus(query);
    const response = engine.focusedResponse(
      {
        id: c.listing_id,
        github_repo_id: 999,
        owner_id: 99,
        full_name: c.repo,
        source_sha: c.commit,
      },
      await engine.focusedEvidence(c.repo, c.commit, focus),
    );
    return { status: 200, response, requests };
  } catch (error) {
    if (error.code !== "source_integrity_failed") throw error;
    return {
      status: 503,
      response: { error: { code: error.code, message: error.message } },
      requests,
    };
  } finally {
    globalThis.fetch = prior;
    process.chdir(previous);
    await engine.close();
  }
}
export async function serveCase(id) {
  const c = (await read("corpus.json")).cases.find((c) => c.id === id),
    requests = [];
  let queue = Promise.resolve();
  const server = http.createServer((req, res) => {
    queue = queue
      .then(async () => {
        const u = new URL(req.url, "http://127.0.0.1");
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Cache-Control", "private, no-store");
        const allowedPaths = new Set([
          c.path,
          c.language === "go" ? "z_helper.go" : "src/helper.rs",
        ]);
        if (
          req.method !== "GET" ||
          req.headers.authorization ||
          u.pathname !== `/api/v2/parts/${c.listing_id}/evidence` ||
          !allowedPaths.has(u.searchParams.get("path")) ||
          [...u.searchParams.keys()].some(
            (k) => !["path", "symbol", "max_characters"].includes(k),
          )
        ) {
          res
            .writeHead(404)
            .end(
              JSON.stringify({
                error: {
                  code: "focus_not_found",
                  message: "No fixture matches this scope.",
                },
              }),
            );
          return;
        }
        const limit = Number(u.searchParams.get("max_characters") ?? 12000);
        if (!Number.isInteger(limit) || limit < 1000 || limit > 24000) {
          res
            .writeHead(400)
            .end(
              JSON.stringify({
                error: {
                  code: "invalid_focus",
                  message: "Invalid packet limit.",
                },
              }),
            );
          return;
        }
        const params = {
          path: u.searchParams.get("path"),
          maxCharacters: limit,
        };
        if (u.searchParams.has("symbol"))
          params.symbol = u.searchParams.get("symbol");
        const result = await focusCase(id, params);
        requests.push({
          method: req.method,
          path: u.pathname,
          query: u.search,
          status: result.status,
          response: result.response,
          sourceReads: result.requests,
        });
        res.writeHead(result.status).end(JSON.stringify(result.response));
      })
      .catch(() => {
        if (!res.headersSent) res.writeHead(500);
        res.end(
          JSON.stringify({
            error: { code: "fixture_error", message: "Fixture failed." },
          }),
        );
      });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    requests,
    close: async () => {
      await queue;
      server.closeIdleConnections();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
if (process.argv[2] === "--capture")
  for (const c of await read("controls.json")) {
    const result = await focusCase(c.id, {
      path: c.requiredPath,
      maxCharacters: 24000,
    });
    await fs.writeFile(
      new URL(c.id + "/recovery-evidence.json", directory),
      JSON.stringify(result, null, 2) + "\n",
      { flag: "wx" },
    );
    console.log(c.id, result.status);
  }
