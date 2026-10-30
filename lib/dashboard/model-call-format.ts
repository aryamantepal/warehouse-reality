/**
 * Display text for model calls, provenance and the run budget. Pure. Unknown
 * usage stays the word "unknown"; nothing here turns a missing value into 0,
 * and only a call the run labelled "nemotron" is ever called Nemotron.
 */

import type { ModelCall, Provenance, RunBudget } from "@/types/run";
import type { DashboardView } from "./project-run";

export const UNKNOWN = "unknown";

export const PROVENANCE_LABEL: Readonly<Record<Provenance, string>> = {
  engine: "engine",
  nemotron: "Nemotron",
  test_model: "CLAUDE (TEST)",
  fallback: "fallback",
  baseline: "FCFS baseline",
  operator: "operator",
  external_search: "external search",
  replay: "replay",
};

export const PROVENANCE_TITLE: Readonly<Record<Provenance, string>> = {
  engine: "Recorded by the authoritative engine",
  nemotron: "Decided by an NVIDIA Nemotron model call",
  test_model: "TEST ONLY: decided by a Claude test model, not Nemotron",
  fallback: "The model call failed; a local fallback decided this turn",
  baseline: "Decided by the first-come-first-served rules, not a model",
  operator: "Injected by the operator as a hypothetical",
  external_search: "Hypothetical sourced from an external search result",
  replay: "Replayed or scripted decision; no live model call",
};

/** Integer with thousands separators, independent of the browser locale. */
const group = (n: number): string =>
  Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");

export const formatTokens = (n: number | null): string =>
  n === null ? UNKNOWN : group(n);

export const formatLatency = (ms: number): string =>
  ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`;

/** Compact count for meters: 950, 3.2k, 150k. */
export const formatCompact = (n: number): string => {
  if (n < 1000) return String(Math.round(n));
  const k = n / 1000;
  return `${Number.isInteger(k) ? k : k.toFixed(1)}k`;
};

export interface CallBadgeText {
  model: string;
  tier: string;
  latency: string;
  tokens: string;
  /** Present only for fallback calls. */
  fallback?: string;
}

export const callBadgeText = (call: ModelCall): CallBadgeText => ({
  model: call.model,
  tier: call.tier,
  latency: formatLatency(call.latencyMs),
  tokens: `${formatTokens(call.promptTokens)} in · ${formatTokens(call.completionTokens)} out`,
  ...(call.isFallback
    ? { fallback: call.fallbackReason ?? "reason not recorded" }
    : {}),
});

/**
 * Provenance of each call as the timeline shows it. A fallback call is
 * "fallback" even if no timeline event names it.
 */
export const callProvenance = (
  view: Pick<DashboardView, "timeline">,
  call: ModelCall,
): Provenance => {
  const fromTimeline = view.timeline.find(
    (e) => e.modelCallId === call.id,
  )?.provenance;
  if (fromTimeline === "baseline") return "baseline";
  if (call.isFallback) return "fallback";
  return fromTimeline ?? "replay";
};

export interface MeterText {
  used: number;
  cap: number;
  /** 0..1, for the bar width. */
  ratio: number;
  label: string;
}

const meter = (used: number, cap: number, label: string): MeterText => ({
  used,
  cap,
  ratio: cap > 0 ? Math.min(1, Math.max(0, used / cap)) : 0,
  label,
});

/**
 * The token total is a lower bound once a budgeted call reported no usage,
 * so it reads "≥N" with the unknown count, never a bare total.
 */
export const budgetMeter = (
  b: RunBudget,
  unreportedCalls = 0,
): { calls: MeterText; tokens: MeterText } => {
  const total = `${formatCompact(b.tokens)}/${formatCompact(b.capTokens)} tokens`;
  return {
    calls: meter(b.calls, b.capCalls, `${b.calls}/${b.capCalls} calls`),
    tokens: meter(
      b.tokens,
      b.capTokens,
      unreportedCalls > 0 ? `≥${total} · ${unreportedCalls} ${UNKNOWN}` : total,
    ),
  };
};

/**
 * Calls that may have spent budget tokens but reported no usage. Only baseline
 * turns (the FCFS rules, or any turn after the cap) never spend, so every
 * other call without usage leaves the token total a lower bound.
 */
export const callsWithoutUsage = (
  view: Pick<DashboardView, "timeline">,
  calls: readonly ModelCall[],
): number =>
  calls.filter(
    (c) =>
      (c.promptTokens === null || c.completionTokens === null) &&
      callProvenance(view, c) !== "baseline",
  ).length;
