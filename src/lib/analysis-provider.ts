import Anthropic from "@anthropic-ai/sdk";

/** Provider boundary contains no repository, publication, review or execution authority. */
export type AnalysisRequest = {
  model: string;
  system: string;
  input: string;
  schema: Record<string, unknown>;
  maxOutputTokens: number;
};
export type AnalysisResponse = {
  text: string;
  model: string;
  requestId: string | null;
  usage: unknown;
  stopReason: string | null;
};
export interface AnalysisProvider {
  generate(request: AnalysisRequest): Promise<AnalysisResponse>;
}

export const anthropicProvider: AnalysisProvider = {
  async generate(request) {
    const workspace = process.env.ANTHROPIC_WORKSPACE_ID?.trim();
    const client = new Anthropic({
      timeout: 120_000,
      maxRetries: 0,
      ...(workspace
        ? { defaultHeaders: { "anthropic-workspace-id": workspace } }
        : {}),
    });
    const response = await client.messages.create({
      model: request.model,
      system: request.system,
      messages: [{ role: "user", content: request.input }],
      max_tokens: request.maxOutputTokens,
      output_config: {
        effort: "medium",
        format: { type: "json_schema", schema: request.schema },
      },
    });
    return {
      text: response.content
        .filter((c) => c.type === "text")
        .map((c) => c.text)
        .join("\n"),
      model: response.model,
      requestId: response._request_id ?? null,
      usage: response.usage,
      stopReason: response.stop_reason,
    };
  },
};
