import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { fixtures } from "../../../examples/native-file-context/fixture.mjs";
test("MCP transmits Go/Rust file relationships and rejects a dangling file reference", async () => {
  const cases = await fixtures();
  let value = cases[0].response;
  const server = http.createServer((_, response) => {
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify(value));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const client = new Client({
    name: "file-context-consumer",
    version: "1.0.0",
  });
  try {
    await client.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: [
          fileURLToPath(new URL("../dist/index.js", import.meta.url)),
          "--base",
          `http://127.0.0.1:${server.address().port}`,
        ],
        stderr: "pipe",
      }),
    );
    for (const c of cases) {
      value = c.response;
      const result = await client.callTool({
        name: "repo_salvage_focus_evidence",
        arguments: c.parameters,
      });
      assert.ok(!result.isError, JSON.stringify(result));
      assert.deepEqual(result.structuredContent, value);
    }
    value = structuredClone(cases[0].response);
    value.packet.file_contexts[0].files[0].reference_id = "f".repeat(24);
    assert.equal(
      (
        await client.callTool({
          name: "repo_salvage_focus_evidence",
          arguments: cases[0].parameters,
        })
      ).isError,
      true,
    );
  } finally {
    await client.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
