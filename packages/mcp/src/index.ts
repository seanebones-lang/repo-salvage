#!/usr/bin/env node
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { createServer } from "./server.js";
export function startup(args: string[], env: NodeJS.ProcessEnv) {
  let base = env.REPO_SALVAGE_URL ?? "";
  let enableDrafts = false;
  const seen = new Set<string>();
  while (args.length) {
    const key = args.shift()!;
    if (seen.has(key)) throw new Error("Repeated option.");
    seen.add(key);
    if (key === "--base") {
      const value = args.shift();
      if (!value || value.startsWith("--")) throw new Error("Missing origin.");
      base = value;
    } else if (key === "--enable-drafts") enableDrafts = true;
    else throw new Error("Unknown option.");
  }
  return {
    base,
    enableDrafts,
    token: enableDrafts ? env.REPO_SALVAGE_TOKEN : undefined,
  };
}
// The executable owns stdio; no diagnostic or help text is written to stdout.
try {
  if (process.argv.slice(2).length === 1 && process.argv[2] === "--help") {
    process.stderr.write(
      "repo-salvage-mcp --base HTTPS_OR_LOOPBACK_ORIGIN [--enable-drafts]\nREPO_SALVAGE_URL can supply the origin. Draft tools additionally require REPO_SALVAGE_TOKEN in the secret environment. Public tools are the default.\n",
    );
  } else {
    const options = startup(process.argv.slice(2), process.env);
    // Validate startup before accepting protocol input or exposing any tool.
    const server = createServer(options);
    const handle = serveStdio(() => server);
    process.once("SIGINT", () => {
      void handle.close();
    });
    process.once("SIGTERM", () => {
      void handle.close();
    });
  }
} catch {
  process.stderr.write(
    "MCP startup failed. Check --base (HTTPS or loopback origin), options and the scoped credential when drafts are enabled. Secrets must be supplied through the environment, never arguments.\n",
  );
  process.exitCode = 1;
}
