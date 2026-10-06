import Anthropic from "@anthropic-ai/sdk";
import type { Summary } from "./db";
import type { GhRepo, RepoSnapshot } from "./github";

const MODEL = process.env.SUMMARY_MODEL ?? "claude-sonnet-5-5";

const SYSTEM = `You analyze an abandoned open-source repository to help other developers reuse parts of it.
Rules:
- Report only what is evidenced in the provided files and tree. Never guess or invent paths.
- Focus on extractable code: functions, modules, patterns, configs. No marketing language, no praise.
- reusable_pieces: 3 to 6 items (fewer only if the repo genuinely has fewer). Each needs a real file path from the tree, a short name, and a single-sentence description of what it does and what it depends on.
- Prefer self-contained pieces with few project-specific dependencies.
- If the owner note says to ignore something, do not list it.
- languages and frameworks: only those evidenced by manifests or source files.
- overview: at most two sentences, stating what the project does.`;

const SCHEMA = {
  type: "object",
  properties: {
    overview: { type: "string" },
    languages: { type: "array", items: { type: "string" } },
    frameworks: { type: "array", items: { type: "string" } },
    reusable_pieces: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          path: { type: "string" },
          description: { type: "string" },
        },
        required: ["name", "path", "description"],
        additionalProperties: false,
      },
    },
  },
  required: ["overview", "languages", "frameworks", "reusable_pieces"],
  additionalProperties: false,
} as const;

export async function summarizeRepo(repo: GhRepo, snap: RepoSnapshot, ownerNote: string | null): Promise<Summary> {
  const client = new Anthropic();
  const body = [
    `Repository: ${repo.full_name}`,
    `Description: ${repo.description ?? "(none)"}`,
    `Primary language (GitHub): ${repo.language ?? "unknown"}`,
    `Owner note: ${ownerNote || "(none)"}`,
    `\nFile tree (truncated):\n${snap.tree.join("\n")}`,
    ...snap.files.map((f) => `\n=== ${f.path} ===\n${f.content}`),
  ].join("\n");

  // Sonnet 5.5 rejects forced tool_choice and non-default temperature, so use
  // structured outputs for schema-valid JSON and keep effort low for stable, cheap runs.
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 8000,
    system: SYSTEM,
    output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
    messages: [{ role: "user", content: body }],
  });
  if (res.stop_reason === "refusal") throw new Error("The model declined to summarize this repository.");
  if (res.stop_reason === "max_tokens") throw new Error("Summary was cut off; try again.");
  const text = res.content.find((c): c is Anthropic.TextBlock => c.type === "text");
  if (!text) throw new Error("Model returned no summary");
  const s = JSON.parse(text.text) as Summary;
  const known = new Set(snap.tree);
  // Drop pieces pointing at paths that do not exist in the repo.
  s.reusable_pieces = (s.reusable_pieces ?? []).filter((p) => known.has(p.path)).slice(0, 6);
  return s;
}
