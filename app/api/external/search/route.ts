/**
 * Searches for external disruption hypotheses. This route never injects
 * anything: a chosen result goes to POST /api/runs/:id/disruptions, the only
 * way to change a run. TAVILY_API_KEY stays on the server.
 */

import { SearchBody } from "@/lib/external/disruption-types";
import { searchFreightDisruptions } from "@/lib/external/tavily-client";
import { parseBody } from "@/lib/run/http";

export const POST = async (request: Request): Promise<Response> => {
  const parsed = await parseBody(request, SearchBody, true);
  if ("response" in parsed) return parsed.response;
  return Response.json(await searchFreightDisruptions(parsed.data.q));
};
