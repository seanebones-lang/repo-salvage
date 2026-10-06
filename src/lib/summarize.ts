import Anthropic from "@anthropic-ai/sdk";
import type { Summary } from "./db";
import type { GhRepo, RepoSnapshot } from "./github";

const MODEL = process.env.SUMMARY_MODEL ?? "claude-sonnet-5-5";

const SYSTEM = `You analyze an abandoned open-source repository to help other developers reuse parts of it.
Rules:
- Report only what is evidenced in the provided files and tree. Never guess or invent paths.
- Focus on extractable code: functions, modules, patterns, configs. No marketing language, no praise.
- reusable_pieces: 3 to 6 items. Each needs a real file path from the tree, a short name, and a single-sentence description of what it does and what it depends on.
- Prefer self-contained pieces with few project-specific dependencies.
- If the owner note says to ignore something, do not list it.
- languages and frameworks: only those evidenced by manifests or source files.
- overview: at most two sentences, stating what the project does.`;

const TOOL: Anthropic.Tool = {
  name: "record_summary",
  description: "Record the structured salvage summary.",
  input_schema: {
    type: "object",
    properties: {
      overview: { type: "string" },
      languages: { type: "array", items: { type: "string" } },
      frameworks: { type: "array", items: { type: "string" } },
      reusable_pieces: {
        type: "array",
        minItems: 3,
        maxItems: 6,
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            path: { type: "string" },
            description: { type: "string" },
          },
          required: ["name", "path", "description"],
        },
      },
    },
    required: ["overview", "languages", "frameworks", "reusable_pieces"],
  },
};

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

  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 1500,
    temperature: 0,
    system: SYSTEM,
    tools: [TOOL],
    tool_choice: { type: "tool", name: TOOL.name },
    messages: [{ role: "user", content: body }],
  });
  const use = res.content.find((c): c is Anthropic.ToolUseBlock => c.type === "tool_use");
  if (!use) throw new Error("Model returned no summary");
  const s = use.input as Summary;
  const known = new Set(snap.tree);
  // Drop pieces pointing at paths that do not exist in the repo.
  s.reusable_pieces = (s.reusable_pieces ?? []).filter((p) => known.has(p.path)).slice(0, 6);
  return s;
}
