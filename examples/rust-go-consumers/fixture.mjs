/** Offline replay of retained focused HTTP responses; synthetic routing IDs. */
import fs from "node:fs/promises";
import http from "node:http";
export async function fixtures() {
  const cases = JSON.parse(
    await fs.readFile(new URL("./cases.json", import.meta.url), "utf8"),
  );
  return Promise.all(
    cases.map(async (c) => ({
      parameters: {
        listing_id: c.listing_id,
        path: c.path,
        symbol: c.symbol,
        max_characters: c.max_characters,
      },
      response: JSON.parse(
        await fs.readFile(
          new URL("./" + c.id + "/evidence.json", import.meta.url),
          "utf8",
        ),
      ),
    })),
  );
}
export async function serveFixture() {
  const cases = await fixtures(),
    requests = [];
  const server = http.createServer((request, response) => {
    requests.push({
      url: request.url,
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
