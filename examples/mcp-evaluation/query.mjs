import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { serveFixture } from "./fixture-server.mjs";
import { fileURLToPath } from "node:url";
const tool = process.argv[2],
  args = JSON.parse(process.argv[3] ?? "{}");
if (!["repo_salvage_search_parts", "repo_salvage_inspect_part"].includes(tool))
  throw new Error("Evaluation query permits search and inspection only.");
const fixture = await serveFixture();
const client = new Client(
  { name: "salvage-evaluation-query", version: "1.0.0" },
  { versionNegotiation: { mode: { pin: "2026-07-28" } } },
);
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [
    fileURLToPath(new URL("../../packages/mcp/dist/index.js", import.meta.url)),
    "--base",
    fixture.origin,
  ],
  stderr: "pipe",
});
try {
  await client.connect(transport);
  const result = await client.callTool({ name: tool, arguments: args });
  process.stdout.write(
    JSON.stringify(result.structuredContent ?? result) + "\n",
  );
} finally {
  await client.close();
  await fixture.close();
}
