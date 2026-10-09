import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import {
  focusCases,
  serveFocusFixture,
} from "../../../examples/focused-evidence/fixture-server.mjs";
const suite = await focusCases();
for (const c of suite.cases)
  test(`focused stdio replay: ${c.probe.symbol} in ${c.probe.repo}`, async () => {
    const fixture = await serveFocusFixture();
    const client = new Client(
      { name: "focus-consumer", version: "1.0.0" },
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
      const tool = (await client.listTools()).tools.find(
        (t) => t.name === "repo_salvage_focus_evidence",
      );
      assert.equal(tool.annotations.readOnlyHint, true);
      assert.equal(tool.inputSchema.additionalProperties, false);
      const result = await client.callTool({
        name: tool.name,
        arguments: c.parameters,
      });
      assert.ok(!result.isError, JSON.stringify(result));
      assert.deepEqual(result.structuredContent, c.response);
      const value = result.structuredContent;
      assert.equal(value.coverage.files[0].same_file_supplied, true);
      assert.equal(
        value.packet.targets.length,
        c.probe.symbol === "createFallbackLimiter" ? 0 : 1,
      );
      assert.ok(Buffer.byteLength(result.content[0].text) <= 65536);
      for (const reference of value.packet.references.filter(
        (r) => r.kind === "file",
      ))
        assert.equal(
          createHash("sha256").update(reference.content).digest("hex"),
          reference.sha256,
        );
      assert.equal(fixture.requests.length, 1);
      assert.equal(fixture.requests[0].method, "GET");
      assert.equal(fixture.requests[0].authorization, undefined);
    } finally {
      await client.close();
      await fixture.close();
    }
  });
