import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { serveFixture } from "../../../examples/mcp-evaluation/fixture-server.mjs";
const questions = JSON.parse(
  await fs.readFile(
    new URL("../../../examples/mcp-evaluation/answers.json", import.meta.url),
    "utf8",
  ),
);
const subset = (actual, expected) => {
  if (expected === null || typeof expected !== "object")
    return assert.deepEqual(actual, expected);
  if (Array.isArray(expected)) assert.equal(actual.length, expected.length);
  for (const key of Object.keys(expected)) subset(actual[key], expected[key]);
};
assert.equal(questions.length, 10);
for (const [i, question] of questions.entries()) {
  test(`frozen evaluation ${i + 1}: recorded multi-hop evidence remains reproducible`, async () => {
    const fixture = await serveFixture();
    const client = new Client(
      { name: "salvage-evidence-replay", version: "1.0.0" },
      { versionNegotiation: { mode: { pin: "2026-07-28" } } },
    );
    try {
      await client.connect(
        new StdioClientTransport({
          command: process.execPath,
          args: [
            fileURLToPath(new URL("../dist/index.js", import.meta.url)),
            "--base",
            fixture.origin,
          ],
          stderr: "pipe",
        }),
      );
      let searchIndex = 0,
        partIndex = 0;
      assert.ok(question.calls.length >= 3);
      assert.ok(question.question.includes(question.evidence.catalog_revision));
      assert.ok(question.answer.length > 0);
      for (const call of question.calls) {
        assert.ok(
          ["repo_salvage_search_parts", "repo_salvage_inspect_part"].includes(
            call.tool,
          ),
        );
        const result = await client.callTool({
          name: call.tool,
          arguments: call.arguments,
        });
        assert.ok(!result.isError, JSON.stringify(result));
        const value = result.structuredContent;
        if (call.tool === "repo_salvage_search_parts") {
          assert.ok(call.arguments.limit <= 10);
          const recorded = question.evidence.searches[searchIndex++];
          assert.equal(
            value.catalog_revision,
            question.evidence.catalog_revision,
          );
          subset(value.query, recorded.query);
          subset(value.pagination, recorded.pagination);
          subset(value.results, recorded.matched_parts);
        } else subset(value, question.evidence.parts[partIndex++]);
      }
      assert.equal(searchIndex, question.evidence.searches.length);
      assert.equal(partIndex, question.evidence.parts.length);
      assert.ok(
        fixture.requests.every((r) => r.method === "GET" && !r.authorization),
      );
    } finally {
      await client.close();
      await fixture.close();
    }
  });
}
