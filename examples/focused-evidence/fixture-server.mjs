import http from "node:http";
import fs from "node:fs/promises";
export async function focusCases() {
  return JSON.parse(
    await fs.readFile(
      new URL("./fixtures/packets.json", import.meta.url),
      "utf8",
    ),
  );
}
/** Offline replay only; production requests use the pinned Git reader and fresh visibility checks. */
/** Authored contract boundary, separate from the six real-source captures. */
export function longPathBoundary(template) {
  const path = "lib/" + "x".repeat(513) + ".ts";
  return {
    parameters: { listing_id: 903, path: "lib/", max_characters: 24000 },
    response: {
      ...template,
      listing_id: 903,
      source: {
        repository_id: 903,
        owner_id: 7,
        repository: "fixture/long-path",
        commit: "a".repeat(40),
      },
      focus: {
        path: "lib/",
        symbol: null,
        symbol_match: null,
        packet_character_limit: 24000,
      },
      coverage: {
        matched_files: 1,
        inspected_files: 0,
        source_bytes: 0,
        indexed_targets: 0,
        supplied_targets: 0,
        context_paths: [],
        files: [
          {
            path,
            size_bytes: 17,
            download_url: null,
            git_blob_sha: "b".repeat(40),
            inspection: "not_inspected",
            reason: "unsupported_path_or_mode",
            indexed_targets: 0,
            supplied_targets: 0,
            same_file_supplied: false,
          },
        ],
        skipped: [{ path, reason: "unsupported_path_or_mode" }],
        skipped_details_omitted: 0,
      },
      packet: {
        format: "repo-salvage/source-index-v2",
        targets: [],
        references: [],
        omitted_targets: 0,
        selection_policy: "repo-salvage/coverage-v1",
        contexts: [],
      },
    },
  };
}
export async function serveFocusFixture({ includeBoundary = false } = {}) {
  const suite = await focusCases();
  if (includeBoundary)
    suite.cases.push(longPathBoundary(suite.cases[0].response));
  const requests = [];
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    requests.push({
      method: request.method,
      path: url.pathname,
      query: url.search,
      authorization: request.headers.authorization,
    });
    response.setHeader("Content-Type", "application/json");
    const c = suite.cases.find(
      (c) =>
        url.pathname === `/api/v2/parts/${c.parameters.listing_id}/evidence` &&
        url.searchParams.get("path") === c.parameters.path &&
        url.searchParams.get("symbol") === (c.parameters.symbol ?? null) &&
        url.searchParams.get("max_characters") === "24000",
    );
    if (request.method !== "GET" || !c) {
      response
        .writeHead(404)
        .end(JSON.stringify({ error: { code: "focus_not_found" } }));
      return;
    }
    response.end(JSON.stringify(c.response));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    requests,
    suite,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
