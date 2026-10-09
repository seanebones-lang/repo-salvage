# Standalone summary parser

This is a worked salvage operation, adapted from `parseSummary` and `clean` in
https://github.com/seanebones-lang/repo-salvage/blob/cfeeae509e90b15c04ceabd2a3f7b315dd303b43/src/lib/summarize.ts.

The adaptation removes TypeScript annotations and module-level Anthropic and database imports.
It preserves the source parser's behavior, including its assumption that input fields have
schema-shaped array types. The current application has stronger validation; this example
deliberately documents the exact older component being reused.

## Run as an independent consumer

Node.js 18 or newer; no install, credentials, provider calls, or app runtime needed.

```sh
node --test consumer.test.mjs
```

```js
import { parseSummary } from "./parser.mjs";
const result = parseSummary(
  JSON.stringify({
    overview: "CSV import",
    languages: ["JavaScript"],
    frameworks: [],
    reusable_pieces: [
      { name: "Parser", path: "lib/csv.mjs", description: "Parses rows" },
    ],
  }),
  ["lib/csv.mjs"],
);
console.log(result.reusable_pieces);
```

The tests establish behavior for this adaptation in isolation. They do not establish
that the original app runs, that every summary is true, or that a component integrates
into your project. Path existence is not code verification. Text cleanup is not a general
security sanitizer. Validate unknown input against a schema before using this version.

Retain the included MIT license and applicable notices when redistributing.
