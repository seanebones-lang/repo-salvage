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
export async function serveFocusFixture() {
  const suite = await focusCases();
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
        url.searchParams.get("symbol") === c.parameters.symbol &&
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
