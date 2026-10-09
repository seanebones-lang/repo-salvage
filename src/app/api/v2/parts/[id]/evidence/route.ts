import { getListing } from "@/lib/db";
import { getPublicListing } from "@/lib/public-listings";
import { getPublicOwnedRepoFresh } from "@/lib/github";
import {
  agentJson,
  agentError,
  AgentError,
  reserveAgentRead,
} from "@/lib/agent-api";
import {
  evidenceFocus,
  createEvidenceCache,
  focusedResponse,
} from "@/lib/focused-evidence";

export const dynamic = "force-dynamic";
const inspect = createEvidenceCache();
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id)))
      throw new AgentError(
        "invalid_identity",
        "Use a positive listing ID from search.",
      );
    const focus = evidenceFocus(new URL(request.url).searchParams);
    reserveAgentRead();
    const listing = await getPublicListing(Number(id), true);
    if (!listing)
      throw new AgentError(
        "not_found",
        "Repository listing is unavailable.",
        404,
      );
    if (!listing.source_sha)
      throw new AgentError(
        "source_unpinned",
        "This legacy listing has no pinned source commit.",
        409,
      );
    const evidence = await inspect(
      `${listing.github_repo_id}:${listing.owner_id}`,
      listing.full_name,
      listing.source_sha,
      focus,
    );
    const repo = await getPublicOwnedRepoFresh(
      listing.github_repo_id,
      listing.owner_id,
    );
    const current = getListing(listing.id);
    if (
      !current ||
      current.moderation_hidden_at ||
      current.github_repo_id !== listing.github_repo_id ||
      current.owner_id !== listing.owner_id
    )
      throw new AgentError(
        "not_found",
        "Repository listing is unavailable.",
        404,
      );
    if (
      current.source_sha !== listing.source_sha ||
      current.analyzed_at !== listing.analyzed_at ||
      repo.full_name !== listing.full_name
    )
      throw new AgentError(
        "analysis_changed",
        "Source identity changed. Restart focused inspection.",
        409,
      );
    return agentJson(
      focusedResponse(
        {
          ...listing,
          source_sha: listing.source_sha,
          full_name: repo.full_name,
        },
        evidence,
      ),
    );
  } catch (error) {
    return agentError(error);
  }
}
