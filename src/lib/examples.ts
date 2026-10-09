import type { Listing, ReusablePiece } from "./db";
import { componentId, reuseBrief } from "./components";

/** Explicit demonstrations, kept out of the owner-submitted catalog and its counts. */
export const exampleListing: Listing = {
  id: 0,
  github_repo_id: 0,
  owner_id: 0,
  owner_login: "seanebones-lang",
  name: "repo-salvage",
  full_name: "seanebones-lang/repo-salvage",
  url: "https://github.com/seanebones-lang/repo-salvage",
  description: "List public repositories so others can salvage reusable parts",
  language: "TypeScript",
  license: "MIT",
  stars: 0,
  forks: 0,
  used_count: 0,
  owner_note: null,
  created_at: "2026-10-06T18:41:57Z",
  source_sha: "cfeeae509e90b15c04ceabd2a3f7b315dd303b43",
  analyzed_at: "2026-10-08T00:00:00Z",
  summary_model: "Manually curated; no model request",
  last_human_commit: "2026-10-06T18:41:57Z",
  summary: {
    overview:
      "Repo Salvage contains small modules for parsing AI summaries, sampling public source and tracking per-user quotas.",
    languages: ["TypeScript"],
    frameworks: ["Node.js"],
    reusable_pieces: [
      {
        name: "Evidence-bound summary parser",
        path: "src/lib/summarize.ts",
        category: "Data processing",
        description:
          "Turn model JSON into bounded text and discard component references that do not exist in a known file tree.",
        dependencies: [
          "The original module imports the Anthropic SDK; the parser itself uses standard JavaScript.",
          "A local Summary type, supplied by the database module in the original project.",
        ],
        related_paths: ["src/lib/db.ts"],
        test_paths: ["tests/summarize.test.ts"],
        source_sampled: true,
        integration_notes:
          "Extract parseSummary and its clean helper, define the summary shape locally, and pass the complete file-path list as the second argument. The included JavaScript adaptation removes TypeScript annotations and module-level provider dependencies. Run its Node.js consumer tests before modifying it for your application.",
        limitations: [
          "Checks path existence, not whether a component works or is safe to reuse.",
          "The original parser assumes model fields have the expected array shapes. Treat it as a starting point for schema-validated responses.",
          "Removing markdown and URLs is text cleanup, not a general prompt-injection or HTML sanitizer.",
        ],
      },
      {
        name: "Commit-pinned repository sampler",
        path: "src/lib/github.ts",
        category: "Developer tools",
        description:
          "Collect a bounded sample of manifests, documentation and source files from a single GitHub commit.",
        dependencies: [
          "Node.js fetch or another compatible Fetch API implementation",
          "GitHub REST API and raw.githubusercontent.com",
          "The GhRepo type and gh helper in the same file",
        ],
        related_paths: [],
        test_paths: ["tests/github.test.ts"],
        source_sampled: true,
        integration_notes:
          "Extract snapshotRepo together with its file-selection expressions, types and GitHub transport helper. Resolve the source commit before sampling. Keep sampled paths separate from the complete tree used for path validation. Choose bounds and exclusions suitable for the target repositories.",
        limitations: [
          "The sample is heuristic and can miss useful components.",
          "Only the first 6,000 characters of each selected file are read into the sample.",
          "The source version uses anonymous API requests; configure rate-aware public API access for a hosted service.",
        ],
      },
      {
        name: "SQLite summary quota",
        path: "src/lib/db.ts",
        category: "Storage",
        description:
          "Track per-user summary attempts over a rolling 24-hour window in a local SQLite database.",
        dependencies: [
          "better-sqlite3",
          "Persistent filesystem storage",
          "A summary_runs table and the local db helper",
        ],
        related_paths: [],
        test_paths: ["tests/db.test.ts"],
        source_sampled: true,
        integration_notes:
          "Extract takeSummaryRun and create its summary_runs table in your own database. Keep quota reservation and the count check in a single transaction when adapting it for concurrent workers. Validate the configured limit and decide whether failed generation attempts consume quota.",
        limitations: [
          "The source version performs the count and reservation separately; adapt it to a transaction for concurrent access.",
          "A per-user quota does not establish a global provider spending cap.",
          "SQLite needs persistent storage and a deployment strategy appropriate for the writer count.",
        ],
      },
    ],
  },
};
export const testedExampleId = componentId(
  exampleListing.summary.reusable_pieces[0],
);

export function exampleReuseBrief(piece: ReusablePiece) {
  return {
    ...reuseBrief(exampleListing, piece),
    example: true,
    example_adaptation:
      componentId(piece) === testedExampleId
        ? {
            tested: true,
            path: "examples/summary-parser",
            command: "node --test consumer.test.mjs",
            bundle: "/summary-parser.tar.gz",
            scope:
              "Included standalone adaptation, not the original repository or a user's integration",
          }
        : null,
  };
}
