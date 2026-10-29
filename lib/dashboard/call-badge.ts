/**
 * Pure view model for a ModelCall badge (plan B5): who answered, how fast and
 * at what token cost. A fallback is never labelled nemotron, and a baseline
 * turn is labelled baseline whatever the call says.
 */

import type { ModelCall, Provenance, RunBudget } from "@/types/run";
import type { RunTimelineEvent } from "./project-run";

export type CallSource = "nemotron" | "fallback" | "baseline" | "other";

export interface CallBadgeView {
  source: CallSource;
  /** NEMOTRON, FALLBACK, BASELINE, or the raw provenance (e.g. replay). */
  label: string;
  model: string;
  tier: ModelCall["tier"];
  latency: string;
  /** "unknown" when the provider reported no usage; never a guessed 0. */
  tokens: string;
  fallbackReason?: ModelCall["fallbackReason"];
}

export const formatLatency = (ms: number): string =>
  ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`;

/** Prompt + completion tokens, or "unknown" if either is unreported. */
export const formatTokens = (call: ModelCall): string =>
  call.promptTokens === null || call.completionTokens === null
    ? "unknown"
    : `${call.promptTokens + call.completionTokens} tok`;

/** The provenance of the timeline turn a call produced, if the run recorded one. */
export const provenanceOfCall = (
  call: ModelCall,
  timeline: readonly RunTimelineEvent[],
): Provenance | undefined =>
  timeline.find((e) => e.modelCallId === call.id)?.provenance;

export const callSource = (
  call: ModelCall,
  provenance: Provenance | undefined,
): CallSource => {
  if (provenance === "baseline") return "baseline";
  if (call.isFallback || provenance === "fallback") return "fallback";
  return provenance === "nemotron" ? "nemotron" : "other";
};

export const callBadgeOf = (
  call: ModelCall,
  provenance: Provenance | undefined,
): CallBadgeView => {
  const source = callSource(call, provenance);
  return {
    source,
    label: source === "other" ? (provenance ?? "unlabelled") : source,
    model: call.model,
    tier: call.tier,
    latency: formatLatency(call.latencyMs),
    tokens: formatTokens(call),
    ...(call.fallbackReason ? { fallbackReason: call.fallbackReason } : {}),
  };
};

/** Calls and tokens against the run's caps, as meter fractions in [0, 1]. */
export const budgetFractions = (
  b: Pick<RunBudget, "calls" | "tokens" | "capCalls" | "capTokens">,
): { calls: number; tokens: number } => ({
  calls: Math.min(1, b.calls / b.capCalls),
  tokens: Math.min(1, b.tokens / b.capTokens),
});
