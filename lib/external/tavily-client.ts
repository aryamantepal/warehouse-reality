/**
 * Tavily external disruption search, server-side only (it reads TAVILY_API_KEY).
 * A search hit can propose a hypothetical disruption; it is context, not
 * evidence the facility was affected. Quantities the source does not state
 * (closure length, delay length) are never filled in.
 */

import { z } from "zod";
import {
  DEFAULT_QUERY,
  type ExternalDisruption,
  type ExternalSearchResult,
} from "./disruption-types";

const TAVILY_URL = "https://api.tavily.com/search";
const SUMMARY_LIMIT = 220;

const tavilyResponse = z.object({
  results: z.array(
    z.object({
      title: z.string(),
      url: z.string(),
      content: z.string().default(""),
      published_date: z.string().nullish(),
    }),
  ),
});

type Category = ExternalDisruption["category"];
type Action = ExternalDisruption["suggestedAction"];

const ACTIONS: Record<Category, Action> = {
  weather: {
    disruptionType: "dock_closure",
    targetEntityId: "D-108",
    impactHypothesis:
      "Hypothesis: exposed dock D-108 is closed while the warning is active. Closure length is unknown.",
  },
  highway: {
    disruptionType: "external_delay",
    targetEntityId: "DRV-047",
    impactHypothesis:
      "Hypothesis: inbound driver DRV-047 arrives late. Delay length is unknown.",
  },
};

const ILLUSTRATIVE: ExternalDisruption[] = [
  {
    id: "ILL-1",
    title: "[Illustrative] Severe thunderstorm warning over the DFW metro",
    summary:
      "Illustrative example, not a real advisory and not a live search result.",
    url: null,
    publishedDate: null,
    category: "weather",
    suggestedAction: ACTIONS.weather,
  },
  {
    id: "ILL-2",
    title: "[Illustrative] Lane closures on I-35 approaching Dallas",
    summary:
      "Illustrative example, not a real advisory and not a live search result.",
    url: null,
    publishedDate: null,
    category: "highway",
    suggestedAction: ACTIONS.highway,
  },
];

const WEATHER =
  /weather|storm|tornado|hail|blizzard|snow|flood|\bice\b|freeze|wind/i;
const HIGHWAY =
  /highway|interstate|\bi-\d+|freeway|turnpike|crash|lane closure|road closure|traffic/i;

const categoryOf = (text: string): Category | null =>
  WEATHER.test(text) ? "weather" : HIGHWAY.test(text) ? "highway" : null;

const illustrative = (fallbackReason: string): ExternalSearchResult => ({
  source: "illustrative",
  fallbackReason,
  disruptions: ILLUSTRATIVE,
});

export const searchFreightDisruptions = async (
  customQuery?: string,
  fetchFn: typeof fetch = fetch,
): Promise<ExternalSearchResult> => {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return illustrative("TAVILY_API_KEY is not configured.");

  try {
    const res = await fetchFn(TAVILY_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query: customQuery?.trim() || DEFAULT_QUERY,
        topic: "news",
        time_range: "week",
        max_results: 6,
        search_depth: "basic",
        include_answer: false,
      }),
    });
    if (!res.ok) {
      return illustrative(`Tavily search failed (HTTP ${res.status}).`);
    }
    const parsed = tavilyResponse.safeParse(await res.json());
    if (!parsed.success) return illustrative("Tavily response was malformed.");

    const disruptions: ExternalDisruption[] = [];
    for (const [i, r] of parsed.data.results.entries()) {
      const category = categoryOf(`${r.title} ${r.content}`);
      // Results matching neither pattern have no defensible scenario mapping.
      if (!category || !z.url().safeParse(r.url).success) continue;
      disruptions.push({
        id: `EXT-${i + 1}`,
        title: r.title,
        summary:
          r.content.length > SUMMARY_LIMIT
            ? `${r.content.slice(0, SUMMARY_LIMIT - 3)}...`
            : r.content,
        url: r.url,
        publishedDate: r.published_date ?? null,
        category,
        suggestedAction: ACTIONS[category],
      });
    }
    if (disruptions.length === 0) {
      return illustrative("No recent weather or highway results matched.");
    }
    return { source: "tavily", fallbackReason: null, disruptions };
  } catch {
    return illustrative("Tavily search failed.");
  }
};
