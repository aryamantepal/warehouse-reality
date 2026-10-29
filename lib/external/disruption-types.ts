/**
 * External disruption contracts shared by the search route and the dashboard.
 * Free of server-only code so client components can parse responses.
 */

import { z } from "zod";
import { DisruptionBody, RunSourceSchema } from "@/lib/run/api-schemas";

/** "tavily": a live search result. "illustrative": synthetic offline example. */
export const externalSourceSchema = z.enum(["tavily", "illustrative"]);
export type ExternalSource = z.infer<typeof externalSourceSchema>;

export const externalDisruptionSchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string(),
  url: z.string().nullable(),
  publishedDate: z.string().nullable(),
  category: z.enum(["weather", "highway"]),
  /** An application hypothesis, never a claim made by the source. */
  suggestedAction: z.object({
    disruptionType: DisruptionBody.shape.type,
    targetEntityId: z.string(),
    impactHypothesis: z.string(),
  }),
});
export type ExternalDisruption = z.infer<typeof externalDisruptionSchema>;

export const externalSearchResultSchema = z.object({
  source: externalSourceSchema,
  /** Why illustrative examples were returned instead of search results. */
  fallbackReason: z.string().nullable(),
  disruptions: z.array(externalDisruptionSchema),
});
export type ExternalSearchResult = z.infer<typeof externalSearchResultSchema>;

export const SearchBody = z.object({ q: z.string().max(300).optional() });

export const DEFAULT_QUERY =
  "Dallas Fort Worth freight I-35 I-20 I-30 highway closure severe weather";

/**
 * The run API body for a chosen result. Only live results with a URL carry
 * `sources` (and so are recorded as external_search); illustrative examples
 * are injected as plain operator hypotheticals.
 */
export const toDisruptionBody = (
  source: ExternalSource,
  item: ExternalDisruption,
): DisruptionBody => {
  const body: DisruptionBody = {
    type: item.suggestedAction.disruptionType,
    targetId: item.suggestedAction.targetEntityId,
  };
  if (source !== "tavily" || !item.url) return body;
  const parsed = RunSourceSchema.safeParse({
    title: item.title,
    url: item.url,
  });
  return parsed.success ? { ...body, sources: [parsed.data] } : body;
};
