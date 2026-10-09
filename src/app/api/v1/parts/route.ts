import { publicCatalog } from "@/lib/public-listings";
import {
  agentError,
  agentJson,
  searchParameters,
  searchResponse,
  reserveAgentRead,
} from "@/lib/agent-api";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    searchParameters(params); // Reject malformed requests before any upstream lookup.
    reserveAgentRead();
    const { listings } = await publicCatalog(true);
    return agentJson(searchResponse(listings, params));
  } catch (error) {
    return agentError(error);
  }
}
