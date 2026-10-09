import { agentJson, agentError, AgentError } from "@/lib/agent-api";
import {
  authenticateAgent,
  createDraft,
  draftsForCredential,
  proposalHash,
  publicDraft,
  replayDraft,
  activeCredential,
} from "@/lib/contributions";
import { boundedJson } from "@/lib/http";
import {
  publicRepoStatus,
  pinnedSourceTree,
  isPublicRepoFresh,
} from "@/lib/github";
export const dynamic = "force-dynamic";
function noQuery(request: Request) {
  if (new URL(request.url).search)
    throw new AgentError(
      "invalid_query",
      "This endpoint takes no query parameters.",
    );
}
export async function GET(request: Request) {
  try {
    noQuery(request);
    const item = authenticateAgent(request);
    return agentJson({
      format: "repo-salvage/drafts-v1",
      drafts: draftsForCredential(item)
        .filter(
          (d) =>
            d.credential_id === item.id && item.repo_ids.includes(d.repo_id),
        )
        .map(publicDraft),
      limit: 50,
    });
  } catch (error) {
    return agentError(error);
  }
}
export async function POST(request: Request) {
  try {
    noQuery(request);
    const item = authenticateAgent(request);
    const key = request.headers.get("idempotency-key") ?? "";
    if (!/^[A-Za-z0-9_-]{8,80}$/.test(key))
      throw new AgentError(
        "invalid_idempotency_key",
        "Supply an Idempotency-Key of 8–80 letters, digits, underscores or hyphens.",
      );
    if (
      request.headers.get("content-type")?.split(";")[0].trim() !==
      "application/json"
    )
      throw new AgentError("invalid_body", "Use application/json.", 415);
    let body: unknown;
    try {
      body = await boundedJson(request, 2048);
    } catch {
      throw new AgentError(
        "invalid_body",
        "Supply valid JSON within 2048 bytes.",
      );
    }
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new AgentError("invalid_body", "Supply a proposal object.");
    const data = body as Record<string, unknown>;
    if (
      Object.keys(data).some(
        (k) => !["repo_id", "source_sha", "note"].includes(k),
      ) ||
      !Number.isSafeInteger(data.repo_id) ||
      (data.repo_id as number) < 1 ||
      typeof data.source_sha !== "string" ||
      !/^[a-f0-9]{40}$/.test(data.source_sha) ||
      typeof data.note !== "string" ||
      !data.note.trim() ||
      data.note.length > 280 ||
      /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(data.note)
    )
      throw new AgentError(
        "invalid_body",
        "Supply repo_id, a lowercase 40-character source_sha and 1–280 characters of context.",
      );
    const repoId = data.repo_id as number;
    if (!item.repo_ids.includes(repoId))
      throw new AgentError(
        "forbidden",
        "Repository is outside this credential's scope.",
        403,
      );
    const note = data.note.trim();
    const digest = proposalHash(repoId, data.source_sha, note);
    const replay = replayDraft(item, key, digest);
    if (replay) return agentJson(publicDraft(replay));
    const status = await publicRepoStatus(repoId, item.owner_id);
    if (status.status === "unavailable")
      throw new AgentError(
        "upstream_unavailable",
        "GitHub verification is unavailable.",
        503,
      );
    if (
      status.status !== "public" ||
      status.repo.fork ||
      !status.repo.license?.spdx_id ||
      status.repo.license.spdx_id === "NOASSERTION"
    )
      throw new AgentError(
        "repository_ineligible",
        "Choose an owned, licensed, non-fork public repository.",
        409,
      );
    await pinnedSourceTree(status.repo.full_name, data.source_sha);
    if (!(await isPublicRepoFresh(repoId, item.owner_id)))
      throw new AgentError(
        "repository_ineligible",
        "Repository is no longer public or owned by the credential owner.",
        409,
      );
    const result = createDraft(item, key, digest, {
      repo_id: repoId,
      full_name: status.repo.full_name,
      source_sha: data.source_sha,
      note,
    });
    if (!activeCredential(item.id))
      throw new AgentError(
        "unauthorized",
        "Credential expired or revoked.",
        401,
      );
    return agentJson(publicDraft(result.draft), result.created ? 201 : 200);
  } catch (error) {
    return agentError(error);
  }
}
