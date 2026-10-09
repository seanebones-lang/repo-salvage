import { publicCatalog } from "@/lib/public-listings";
import {
  agentError,
  agentJson,
  searchParameters,
  searchResponse,
  reserveAgentRead,
} from "@/lib/agent-api";

export const dynamic = "force-dynamic";

export async function getParts(request: Request, version: 1 | 2 = 1) {
  try {
    const params = new URL(request.url).searchParams;
    searchParameters(params, version); // Reject malformed requests before any upstream lookup.
    reserveAgentRead();
    const { listings } = await publicCatalog(true);
    return agentJson(searchResponse(listings, params, version));
  } catch (error) {
    return agentError(error);
  }
}

export const GET = (request: Request) => getParts(request, 1);
