import { getListing } from "@/lib/db";
import { getPublicListing } from "@/lib/public-listings";
import { pinnedSourceTree } from "@/lib/github";
import { componentId } from "@/lib/components";
import {
  AgentError,
  agentError,
  agentJson,
  inspectionResponse,
  reserveAgentRead,
} from "@/lib/agent-api";

export const dynamic = "force-dynamic";

export async function getPart(
  _request: Request,
  { params }: { params: Promise<{ id: string; part: string }> },
  version: 1 | 2 = 1,
) {
  try {
    const { id, part } = await params;
    if (
      !/^[1-9]\d*$/.test(id) ||
      !Number.isSafeInteger(Number(id)) ||
      !/^[a-f0-9]{16}$/.test(part)
    )
      throw new AgentError(
        "invalid_identity",
        "Use a positive listing ID and a 16-character part ID.",
      );
    reserveAgentRead();
    const listing = await getPublicListing(Number(id), true);
    const piece = listing?.summary.reusable_pieces.find(
      (candidate) => componentId(candidate) === part,
    );
    if (!listing || !piece)
      throw new AgentError("not_found", "Part is unavailable.", 404);
    if (!listing.source_sha)
      throw new AgentError(
        "source_unpinned",
        "This legacy part has no pinned source commit.",
        409,
      );
    const tree = await pinnedSourceTree(listing.full_name, listing.source_sha);
    // A hide, removal or re-analysis during tree retrieval must invalidate this response.
    const current = getListing(listing.id);
    if (
      !current ||
      current.moderation_hidden_at ||
      current.github_repo_id !== listing.github_repo_id ||
      current.owner_id !== listing.owner_id
    )
      throw new AgentError("not_found", "Part is unavailable.", 404);
    if (
      current.source_sha !== listing.source_sha ||
      current.analyzed_at !== listing.analyzed_at
    )
      throw new AgentError(
        "analysis_changed",
        "Analysis changed. Inspect the part again.",
        409,
      );
    const currentPiece = current.summary.reusable_pieces.find(
      (candidate) => componentId(candidate) === part,
    );
    if (!currentPiece)
      throw new AgentError("not_found", "Part is unavailable.", 404);
    return agentJson(
      inspectionResponse(
        { ...listing, summary: current.summary },
        currentPiece,
        part,
        tree,
        version,
      ),
    );
  } catch (error) {
    return agentError(error);
  }
}

export const GET = (
  request: Request,
  context: { params: Promise<{ id: string; part: string }> },
) => getPart(request, context, 1);
