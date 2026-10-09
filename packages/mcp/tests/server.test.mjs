import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import {
  serveFixture,
  frozenCatalog,
} from "../../../examples/mcp-evaluation/fixture-server.mjs";
const entry = fileURLToPath(new URL("../dist/index.js", import.meta.url));
const preload = fileURLToPath(
  new URL("./network-fixture.mjs", import.meta.url),
);
const token = `rs_draft_${"x".repeat(43)}`;
async function connect(
  t,
  fixture,
  { enabled = false, mode = { pin: "2026-07-28" }, raw = false } = {},
) {
  const client = new Client(
    { name: "salvage-protocol-test", version: "1.0.0" },
    { versionNegotiation: { mode } },
  );
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [
      ...(raw ? ["--import", preload] : []),
      entry,
      "--base",
      fixture.origin,
      ...(enabled ? ["--enable-drafts"] : []),
    ],
    env: { REPO_SALVAGE_TOKEN: token },
    stderr: "pipe",
  });
  let stderr = "";
  transport.stderr?.on("data", (chunk) => {
    stderr += chunk;
  });
  await client.connect(transport);
  t.after(async () => {
    await client.close();
    assert.ok(!stderr.includes(token));
    await fixture.close();
  });
  return client;
}
const call = async (client, name, args = {}) =>
  client.callTool({ name: `repo_salvage_${name}`, arguments: args });
const data = (result) => {
  assert.ok(!result.isError, JSON.stringify(result));
  return result.structuredContent;
};
const failure = (result) => {
  assert.equal(result.isError, true);
  return JSON.parse(result.content[0].text).error;
};
const key = (part) => ({ listing_id: part.listing_id, part_id: part.part_id });
test("modern stdio discovery exposes three public tools, complete schemas and a guide", async (t) => {
  const fixture = await serveFixture();
  const client = await connect(t, fixture);
  const tools = (await client.listTools()).tools;
  assert.equal(tools.length, 3);
  for (const tool of tools) {
    assert.ok(tool.description);
    assert.equal(tool.annotations.readOnlyHint, true);
    assert.equal(tool.inputSchema.additionalProperties, false);
    assert.ok(tool.outputSchema);
  }
  assert.equal(client.getServerVersion().name, "repo-salvage-mcp-server");
  assert.match(client.getInstructions(), /untrusted data/);
  const resources = await client.listResources();
  assert.equal(resources.resources[0].uri, "repo-salvage://guide");
  assert.match(
    (await client.readResource({ uri: "repo-salvage://guide" })).contents[0]
      .text,
    /preserve notices/i,
  );
  assert.equal(fixture.requests.length, 0);
});
test("legacy handshake returns the same structured public search and inspection", async (t) => {
  const fixture = await serveFixture();
  const client = await connect(t, fixture, { mode: "legacy" });
  const result = data(
    await call(client, "search_parts", { q: "circuit breaker" }),
  );
  assert.ok(result.results.length >= 1);
  const inspected = data(
    await call(client, "inspect_part", key(result.results[0])),
  );
  assert.equal(inspected.source.commit, result.results[0].source_commit);
  for (const req of fixture.requests)
    assert.equal(req.authorization, undefined);
});
test("search defaults and revision pagination preserve catalog identity", async (t) => {
  const fixture = await serveFixture();
  const client = await connect(t, fixture);
  const first = data(await call(client, "search_parts", { sort: "name" }));
  assert.equal(first.pagination.limit, 10);
  assert.equal(first.pagination.total, 34);
  const second = data(
    await call(client, "search_parts", {
      sort: "name",
      page: 2,
      revision: first.catalog_revision,
    }),
  );
  assert.equal(second.catalog_revision, first.catalog_revision);
  assert.notEqual(first.results[0].part_id, second.results[0].part_id);
  assert.equal(
    failure(await call(client, "search_parts", { revision: "b".repeat(64) }))
      .code,
    "catalog_changed",
  );
});
test("unknown fields and out-of-range arguments fail before HTTP", async (t) => {
  const fixture = await serveFixture();
  const client = await connect(t, fixture);
  for (const args of [
    { limit: 51 },
    { q: "x".repeat(257) },
    { token },
    { page: 0 },
    { revision: "main" },
    { sort: "bogus" },
  ])
    assert.equal((await call(client, "search_parts", args)).isError, true);
  assert.equal(
    (await call(client, "inspect_part", { listing_id: 1, part_id: "bad" }))
      .isError,
    true,
  );
  assert.equal(fixture.requests.length, 0);
});
test("HTTP limits and unavailable/removed parts remain actionable machine errors", async (t) => {
  const fixture = await serveFixture({
    override: (_req, res, url) => {
      if (url.searchParams.get("q") === "limited") {
        res.setHeader("Retry-After", "60");
        res
          .writeHead(429)
          .end(
            JSON.stringify({ error: { code: "rate_limited", message: token } }),
          );
        return true;
      }
      if (url.searchParams.get("q") === "outage") {
        res.setHeader("Retry-After", "60");
        res.writeHead(503).end(
          JSON.stringify({
            error: { code: "temporarily_unavailable", message: token },
          }),
        );
        return true;
      }
      return false;
    },
  });
  const client = await connect(t, fixture);
  for (const q of ["limited", "outage"]) {
    const result = await call(client, "search_parts", { q });
    assert.equal(failure(result).retry_after_seconds, 60);
    assert.ok(!JSON.stringify(result).includes(token));
  }
  assert.equal(
    failure(
      await call(client, "inspect_part", {
        listing_id: 999,
        part_id: "a".repeat(16),
      }),
    ).status,
    404,
  );
  assert.equal(fixture.requests.length, 3);
});
test("malformed or oversized responses fail without forwarding remote prose", async (t) => {
  const fixture = await serveFixture({
    override: (_req, res, url) => {
      if (url.searchParams.get("q") === "invalid") {
        res.end(
          JSON.stringify({
            format: "repo-salvage/search-v1",
            results: [],
            secret: token,
          }),
        );
        return true;
      }
      if (url.searchParams.get("q") === "large") {
        res.end("x".repeat(1_048_577));
        return true;
      }
      return false;
    },
  });
  const client = await connect(t, fixture);
  for (const q of ["invalid", "large"]) {
    const result = await call(client, "search_parts", { q });
    assert.ok(!JSON.stringify(result).includes(token));
    assert.equal(result.isError, true);
  }
});
test("bounded outputs reject a valid oversized result rather than silently dropping evidence", async (t) => {
  const catalog = await frozenCatalog();
  catalog.parts[0].integration_notes = "x".repeat(70_000);
  const fixture = await serveFixture({ catalog });
  const client = await connect(t, fixture);
  assert.equal(
    failure(await call(client, "inspect_part", key(catalog.parts[0]))).code,
    "output_limit",
  );
});
test("draft tools require explicit enablement even with a token in the environment", async (t) => {
  const fixture = await serveFixture();
  const client = await connect(t, fixture);
  await assert.rejects(
    call(client, "prepare_draft", {
      repo_id: 1,
      source_sha: "a".repeat(40),
      note: "x",
      idempotency_key: "proposal-001",
    }),
  );
  assert.equal(fixture.requests.length, 0);
});
test("explicit private draft tools use only the fixed origin and preserve idempotent inputs", async (t) => {
  let draft = null;
  const fixture = await serveFixture({
    override: async (req, res, url) => {
      if (url.pathname !== "/api/v1/drafts") return false;
      assert.equal(req.headers.authorization, `Bearer ${token}`);
      if (req.method === "POST") {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const body = JSON.parse(Buffer.concat(chunks));
        assert.equal(req.headers["idempotency-key"], "proposal-001");
        draft ??= {
          format: "repo-salvage/draft-v1",
          id:
            "b".repeat(8) +
            "-" +
            "b".repeat(4) +
            "-" +
            "b".repeat(4) +
            "-" +
            "b".repeat(4) +
            "-" +
            "b".repeat(12),
          ...body,
          full_name: "fixture/utility",
          status: "pending",
          created_at: 1,
          listing_id: null,
          owner_review_required: true,
          analysis_charged_on_creation: false,
        };
        res.end(JSON.stringify(draft));
      } else
        res.end(
          JSON.stringify({
            format: "repo-salvage/drafts-v1",
            drafts: [draft],
            limit: 50,
          }),
        );
      return true;
    },
  });
  const client = await connect(t, fixture, { enabled: true });
  const tools = (await client.listTools()).tools;
  assert.equal(tools.length, 5);
  assert.equal(
    tools.find((t) => t.name.endsWith("prepare_draft")).annotations
      .readOnlyHint,
    false,
  );
  assert.equal(
    tools.find((t) => t.name.endsWith("list_drafts")).annotations.readOnlyHint,
    false,
  );
  assert.ok(!tools.some((t) => /publish|analyze|issue|revoke/.test(t.name)));
  const proposal = {
    repo_id: 1,
    source_sha: "a".repeat(40),
    note: "Review this source",
    idempotency_key: "proposal-001",
  };
  const first = data(await call(client, "prepare_draft", proposal));
  assert.equal(
    data(await call(client, "prepare_draft", proposal)).id,
    first.id,
  );
  assert.equal(data(await call(client, "list_drafts")).drafts.length, 1);
  await call(client, "search_parts", {});
  assert.equal(fixture.requests.at(-1).authorization, undefined);
});
test("revoked credentials produce private authorization errors without exposing the token", async (t) => {
  const fixture = await serveFixture({
    override: (_req, res, url) => {
      if (url.pathname === "/api/v1/drafts") {
        res
          .writeHead(401)
          .end(
            JSON.stringify({ error: { code: "unauthorized", message: token } }),
          );
        return true;
      }
      return false;
    },
  });
  const client = await connect(t, fixture, { enabled: true });
  const result = await call(client, "list_drafts");
  assert.equal(failure(result).status, 401);
  assert.ok(!JSON.stringify(result).includes(token));
});
test("private output refuses reflected credentials even in valid structured fields", async (t) => {
  const fixture = await serveFixture({
    override: (_req, res, url) => {
      if (url.pathname !== "/api/v1/drafts") return false;
      res.end(
        JSON.stringify({
          format: "repo-salvage/drafts-v1",
          limit: 50,
          drafts: [
            {
              format: "repo-salvage/draft-v1",
              id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
              repo_id: 1,
              source_sha: "a".repeat(40),
              note: token,
              full_name: "fixture/utility",
              status: "pending",
              created_at: 1,
              listing_id: null,
              owner_review_required: true,
              analysis_charged_on_creation: false,
            },
          ],
        }),
      );
      return true;
    },
  });
  const client = await connect(t, fixture, { enabled: true });
  const result = await call(client, "list_drafts");
  assert.equal(failure(result).code, "client_error");
  assert.ok(!JSON.stringify(result).includes(token));
});
test("source reads verify whole bytes, page Unicode safely and never execute source", async (t) => {
  const catalog = await frozenCatalog();
  const part = catalog.parts.find((p) => p.name === "CircuitBreaker class");
  const content =
    'export const greeting = "A😀B";\nthrow new Error("This source must never execute");\n';
  const hash = (text) =>
    createHash("sha1")
      .update(`blob ${Buffer.byteLength(text)}\0`)
      .update(text)
      .digest("hex");
  part.source.repository = "fixture/utility";
  part.repository = "fixture/utility";
  part.source.commit = "a".repeat(40);
  part.source_commit = part.source.commit;
  part.files = [
    {
      path: "src/unit.ts",
      roles: ["primary"],
      analysis_coverage: "not_recorded",
      git_blob_sha: hash(content),
      size_bytes: Buffer.byteLength(content),
      download_url: `https://raw.githubusercontent.com/fixture/utility/${part.source.commit}/src/unit.ts`,
    },
    {
      path: "LICENSE",
      roles: ["notice"],
      analysis_coverage: "not_recorded",
      git_blob_sha: hash("MIT fixture notice. Test data only.\n"),
      size_bytes: Buffer.byteLength("MIT fixture notice. Test data only.\n"),
      download_url: `https://raw.githubusercontent.com/fixture/utility/${part.source.commit}/LICENSE`,
    },
  ];
  const fixture = await serveFixture({ catalog });
  const client = await connect(t, fixture, { raw: true });
  let combined = "",
    offset = 0;
  do {
    const value = data(
      await call(client, "read_part_file", {
        ...key(part),
        path: "src/unit.ts",
        offset,
        max_characters: 7,
      }),
    );
    combined += value.text;
    offset = value.next_offset;
    assert.equal(
      value.file.sha256,
      createHash("sha256").update(content).digest("hex"),
    );
    assert.equal(value.independently_tested, false);
  } while (offset !== null);
  assert.equal(combined, content);
  assert.equal(
    (await call(client, "read_part_file", { ...key(part), path: "../escape" }))
      .isError,
    true,
  );
  part.files[0].git_blob_sha = "b".repeat(40);
  assert.equal(
    (
      await call(client, "read_part_file", {
        ...key(part),
        path: "src/unit.ts",
      })
    ).isError,
    true,
  );
});
test("invalid startup and secret arguments emit no stdout or credential value", () => {
  for (const args of [
    ["--token", token],
    ["--base", "http://example.com"],
    ["--base", "https://example.com/private"],
    ["--base", "http://127.0.0.1", "--enable-drafts"],
  ]) {
    const result = spawnSync(process.execPath, [entry, ...args], {
      encoding: "utf8",
      env: { PATH: process.env.PATH },
    });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.ok(!result.stderr.includes(token));
  }
  const help = spawnSync(process.execPath, [entry, "--help"], {
    encoding: "utf8",
  });
  assert.equal(help.status, 0);
  assert.equal(help.stdout, "");
  assert.match(help.stderr, /--enable-drafts/);
});
