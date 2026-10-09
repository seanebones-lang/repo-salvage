/** Authored offline boundary probes; never imported or executed as target code. */
import http from "node:http";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { loadEngine, root } from "../analysis-evaluation/engine.mjs";
export async function fixtures() {
  const previousDirectory = process.cwd();
  process.chdir(root);
  const engine = await loadEngine(),
    prior = globalThis.fetch,
    commit = "b".repeat(40);
  const probes = [
    {
      listing_id: 993,
      path: "p/main.go",
      symbol: "Value",
      files: {
        "p/main.go": "package p\nfunc Value() int {return helper()}",
        "p/helper.go": "package p\nfunc helper() int {return 7}",
        "p/other.go": "package other\nfunc Ignore(){}",
        LICENSE: "MIT",
      },
    },
    {
      listing_id: 994,
      path: "src/lib.rs",
      symbol: "value",
      files: {
        "src/lib.rs": "mod helper;\npub fn value()->u32 { helper::number() }",
        "src/helper.rs": "pub fn number()->u32 {7}",
        LICENSE: "MIT",
      },
    },
  ];
  try {
    const cases = [];
    for (const c of probes) {
      globalThis.fetch = async (input) => {
        const url = String(input);
        if (url.includes("/git/trees/"))
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
        const f = Object.entries(c.files).find(([path]) =>
          url.endsWith("/" + path),
        );
        if (!f) throw Error("Unknown authored source request");
        return new Response(f[1]);
      };
      const response = engine.focusedResponse(
        {
          id: c.listing_id,
          github_repo_id: 99,
          owner_id: 9,
          full_name: "authored/context",
          source_sha: commit,
        },
        await engine.focusedEvidence("authored/context", commit, {
          path: c.path,
          symbol: c.symbol,
          maxCharacters: 12000,
        }),
      );
      cases.push({
        parameters: {
          listing_id: c.listing_id,
          path: c.path,
          symbol: c.symbol,
          max_characters: 12000,
        },
        response,
      });
    }
    const pinned = JSON.parse(
      await fs.readFile(new URL("./pinned.json", import.meta.url), "utf8"),
    );
    for (const c of pinned.cases)
      cases.push({
        parameters: {
          listing_id: c.listing_id,
          path: c.path,
          symbol: c.symbol,
          max_characters: c.max_characters,
        },
        response: c.response,
      });
    return cases;
  } finally {
    process.chdir(previousDirectory);
    globalThis.fetch = prior;
    await engine.close();
  }
}
export async function serveFixture() {
  const cases = await fixtures(),
    requests = [];
  const server = http.createServer((request, response) => {
    requests.push({
      method: request.method,
      authorization: request.headers.authorization,
    });
    const url = new URL(request.url, "http://localhost"),
      c = cases.find(
        (c) =>
          url.pathname === `/api/v2/parts/${c.parameters.listing_id}/evidence`,
      );
    if (
      !c ||
      request.method !== "GET" ||
      url.searchParams.get("path") !== c.parameters.path ||
      url.searchParams.get("symbol") !== c.parameters.symbol ||
      url.searchParams.get("max_characters") !==
        String(c.parameters.max_characters)
    ) {
      response.writeHead(404);
      response.end();
      return;
    }
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify(c.response));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    cases,
    requests,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
