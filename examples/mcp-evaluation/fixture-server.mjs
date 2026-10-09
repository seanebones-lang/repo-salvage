import http from "node:http";
import fs from "node:fs/promises";
export async function frozenCatalog() {
  return JSON.parse(
    await fs.readFile(
      new URL("./fixtures/catalog.json", import.meta.url),
      "utf8",
    ),
  );
}
/** Frozen public API replay for reproducible evaluations; never an alternate production API. */
export async function serveFixture({ catalog, override } = {}) {
  catalog ??= await frozenCatalog();
  const requests = [];
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    requests.push({
      path: url.pathname,
      query: url.search,
      authorization: request.headers.authorization,
      method: request.method,
    });
    response.setHeader("Content-Type", "application/json");
    response.setHeader("Cache-Control", "private, no-store");
    if (override && (await override(request, response, url))) return;
    if (request.method !== "GET") {
      response
        .writeHead(404)
        .end(JSON.stringify({ error: { code: "not_found" } }));
      return;
    }
    if (["/api/v1/parts", "/api/v2/parts"].includes(url.pathname)) {
      const q = url.searchParams.get("q") ?? "";
      const filters = ["language", "license", "category"];
      const revision = url.searchParams.get("revision");
      if (revision && revision !== catalog.search.catalog_revision) {
        response
          .writeHead(409)
          .end(JSON.stringify({ error: { code: "catalog_changed" } }));
        return;
      }
      const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
      const hits = catalog.search.results.filter(
        (row) =>
          terms.every((term) =>
            JSON.stringify(row).toLowerCase().includes(term),
          ) &&
          filters.every((key) => {
            const value = url.searchParams.get(key);
            return (
              !value ||
              (key === "language"
                ? row.languages.includes(value)
                : key === "license"
                  ? row.repository_license === value
                  : row.category === value)
            );
          }),
      );
      const page = Number(url.searchParams.get("page") ?? 1),
        limit = Number(url.searchParams.get("limit") ?? 10);
      const next = new URLSearchParams(url.searchParams);
      next.set("page", String(page + 1));
      next.set("revision", catalog.search.catalog_revision);
      response.end(
        JSON.stringify({
          ...catalog.search,
          format: url.pathname.includes("/v2/")
            ? "repo-salvage/search-v2"
            : "repo-salvage/search-v1",
          query: {
            q,
            language: url.searchParams.get("language") ?? "",
            license: url.searchParams.get("license") ?? "",
            category: url.searchParams.get("category") ?? "",
            sort: url.searchParams.get("sort") ?? (q ? "relevance" : "latest"),
          },
          pagination: {
            page,
            limit,
            total: hits.length,
            next: page * limit < hits.length ? `${url.pathname}?${next}` : null,
          },
          results: hits.slice((page - 1) * limit, page * limit),
        }),
      );
      return;
    }
    const match = /^\/api\/v[12]\/parts\/(\d+)\/([a-f0-9]{16})$/.exec(
      url.pathname,
    );
    const part =
      match &&
      catalog.parts.find(
        (row) =>
          row.listing_id === Number(match[1]) && row.part_id === match[2],
      );
    if (part)
      response.end(
        JSON.stringify({
          ...part,
          format: url.pathname.includes("/v2/")
            ? "repo-salvage/part-v2"
            : "repo-salvage/part-v1",
        }),
      );
    else
      response
        .writeHead(404)
        .end(JSON.stringify({ error: { code: "not_found" } }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    requests,
    close: () =>
      new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}
