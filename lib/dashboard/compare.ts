/**
 * Pure projection of two finished runs (agents vs first-come rules) into a
 * side-by-side table (plan B7). Numbers come only from computeMetrics; an
 * "unknown" metric stays the word "unknown". Nothing here ranks the columns.
 */

import { computeMetrics, type RunMetrics } from "@/lib/run/metrics";
import type { RunSnapshot } from "@/types/run";

export interface CompareRow {
  key: keyof RunMetrics;
  label: string;
  agents: string;
  baseline: string;
}

export type CompareKind = "model" | "partly_baseline" | "all_baseline";

export interface CompareProvenance {
  kind: CompareKind;
  /** Headline shown above the table. */
  title: string;
  detail: string;
}

export interface Comparison {
  rows: CompareRow[];
  agentsModels: string;
  baselineModels: string;
  provenance: CompareProvenance;
  /** True when either run is not finished, so its numbers are partial. */
  incomplete: boolean;
}

const fmt = (value: number | "unknown", unit: string): string =>
  value === "unknown" ? "unknown" : `${Number(value.toFixed(2))}${unit}`;

const ROWS: {
  key: keyof RunMetrics;
  label: string;
  unit: string;
}[] = [
  { key: "driverWaitingSec", label: "Driver waiting", unit: " s" },
  { key: "departureLatenessSec", label: "Departure lateness", unit: " s" },
  { key: "doorHoursLost", label: "Door hours lost", unit: " h" },
  { key: "invalidProposals", label: "Rejected proposals", unit: "" },
  { key: "modelCalls", label: "Model calls", unit: "" },
  { key: "tokens", label: "Tokens", unit: "" },
];

/** Distinct model ids that genuinely answered a call (fallbacks excluded). */
export const answeringModels = (snapshot: RunSnapshot): string[] => [
  ...new Set(
    snapshot.modelCalls.filter((c) => !c.isFallback).map((c) => c.model),
  ),
];

const provenanceOf = (
  agents: RunSnapshot,
  baseline: RunSnapshot,
  agentMetrics: RunMetrics,
): CompareProvenance => {
  if (agentMetrics.modelCalls === 0) {
    return {
      kind: "all_baseline",
      title: "Both columns are first-come rules",
      detail:
        "No model answered the agent run (no API key or every call fell back), so this is not Nemotron versus first-come. Both sides ran the scripted baseline.",
    };
  }
  const fellBack = agents.modelCalls.some((c) => c.isFallback);
  if (fellBack || agents.budget.exhausted || baseline.budget.exhausted) {
    return {
      kind: "partly_baseline",
      title: "Partly baseline",
      detail:
        "Some agent turns fell back to first-come rules or a run hit its call or token cap.",
    };
  }
  return {
    kind: "model",
    title: "Agents (Nemotron) vs first-come rules",
    detail:
      "Identical scenario and disruptions. Numbers are measured from each run; no column is declared better.",
  };
};

export const buildComparison = (
  agents: RunSnapshot,
  baseline: RunSnapshot,
): Comparison => {
  const a = computeMetrics(agents);
  const b = computeMetrics(baseline);
  const models = answeringModels(agents);
  return {
    rows: ROWS.map(({ key, label, unit }) => ({
      key,
      label,
      agents: fmt(a[key], unit),
      baseline: fmt(b[key], unit),
    })),
    agentsModels: models.length > 0 ? models.join(", ") : "none answered",
    baselineModels: "none (first-come rules)",
    provenance: provenanceOf(agents, baseline, a),
    incomplete: agents.status !== "done" || baseline.status !== "done",
  };
};
