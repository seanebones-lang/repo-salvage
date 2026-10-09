#!/usr/bin/env node
import { fetchPart, inspect, search, baseUrl } from "../lib/client.mjs";

const HELP = `Repo Salvage — read-only agent client (Node.js 22+)

repo-salvage search --base ORIGIN [--q TEXT] [--language NAME] [--license SPDX]
                    [--category NAME] [--sort relevance|latest|name|reviewed] [--page N] [--limit N] [--revision HASH]
repo-salvage inspect LISTING_ID PART_ID --base ORIGIN
repo-salvage fetch LISTING_ID PART_ID --base ORIGIN --out NEW_DIRECTORY
                   [--include-related] [--include-tests]

All output is JSON. No credentials or paid model calls are needed.
Fetch downloads primary source and discovered notices; optional files require explicit flags.
It never executes code or installs dependencies. Existing destinations are rejected.
Use the returned pagination.next or revision to detect a changing catalog.
`;

try {
  const args = process.argv.slice(2);
  if (!args.length || args[0] === "--help" || args[0] === "help") {
    process.stdout.write(HELP);
  } else {
    const command = args.shift();
    if (!["search", "inspect", "fetch"].includes(command))
      throw new Error("Unknown command. Use --help.");
    const positional = command === "search" ? [] : args.splice(0, 2);
    const allowed = new Set(
      command === "search"
        ? [
            "base",
            "q",
            "language",
            "license",
            "category",
            "sort",
            "page",
            "limit",
            "revision",
          ]
        : command === "fetch"
          ? ["base", "out", "include-related", "include-tests"]
          : ["base"],
    );
    const options = {};
    while (args.length) {
      const key = args.shift();
      if (
        !key.startsWith("--") ||
        !allowed.has(key.slice(2)) ||
        Object.hasOwn(options, key.slice(2))
      )
        throw new Error("Unknown or repeated option. Use --help.");
      const name = key.slice(2);
      if (name.startsWith("include-")) options[name] = true;
      else {
        const value = args.shift();
        if (value === undefined || value.startsWith("--"))
          throw new Error(`Missing value for ${key}.`);
        options[name] = value;
      }
    }
    const base = baseUrl(options.base ?? process.env.REPO_SALVAGE_URL ?? "");
    let result;
    if (command === "search") {
      const { base: _base, ...params } = options;
      result = await search(base, params);
    } else if (command === "inspect")
      result = await inspect(base, ...positional);
    else
      result = await fetchPart({
        base,
        listing: positional[0],
        part: positional[1],
        out: options.out,
        includeRelated: !!options["include-related"],
        includeTests: !!options["include-tests"],
      });
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  }
} catch (error) {
  process.stderr.write(
    JSON.stringify({
      error: {
        code: error.code ?? "client_error",
        message: error.message,
        ...(error.status ? { status: error.status } : {}),
        ...(error.retry_after_seconds !== undefined
          ? { retry_after_seconds: error.retry_after_seconds }
          : {}),
      },
    }) + "\n",
  );
  process.exitCode = 1;
}
