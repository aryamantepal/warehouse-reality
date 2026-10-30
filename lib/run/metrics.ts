/**
 * Run metrics (PRD §15), computed only from what a RunSnapshot records. A
 * field that the record cannot support is "unknown", never 0 or an estimate.
 */

import type { ModelCall, RunSnapshot } from "../../types/run";

export interface RunMetrics {
  /**
   * Seconds of logical time driver trailers spent stuck at a closed dock, up to
   * the snapshot's logical time. "unknown" when no logical time elapsed in the
   * recorded events, or when a driver's trailer was moved: events keep no
   * location history, so its earlier wait cannot be attributed. Road and yard
   * stages are not separated.
   */
  driverWaitingSec: number | "unknown";
  /**
   * Positive difference between departure and a configured target. "unknown"
   * because a RunSnapshot carries no departure event or departure target. The
   * driver goal's targetTime is a delivery goal, not a departure target.
   */
  departureLatenessSec: number | "unknown";
  /**
   * Hours of door time lost: each closed dock counted from its closure event
   * to the snapshot's logical time. "unknown" when no logical time elapsed, or
   * when a dock with a closure event is no longer closed (reopening is not
   * recorded). Counts closed doors only, not blocked or idle ones.
   */
  doorHoursLost: number | "unknown";
  /** Rejected tool outcomes from any deliberator; no_tool is not counted. */
  invalidProposals: number;
  /**
   * Real model calls: turns whose event provenance is "nemotron" or "test_model" and that are
   * not fallbacks. Baseline, scripted, replay and fallback turns are excluded.
   */
  modelCalls: number;
  /**
   * Prompt plus completion tokens of the counted calls. "unknown" if any
   * counted call has no reported usage; 0 only when no call was counted.
   */
  tokens: number | "unknown";
}

const UNKNOWN = "unknown" as const;
const SECONDS_PER_HOUR = 3600;

const countedCalls = (snapshot: RunSnapshot): ModelCall[] => {
  const real = new Set(
    snapshot.events
      .filter(
        (e) =>
          e.type === "agent_turn" &&
          (e.provenance === "nemotron" || e.provenance === "test_model") &&
          e.causationId !== undefined,
      )
      .map((e) => e.causationId),
  );
  return snapshot.modelCalls.filter((c) => !c.isFallback && real.has(c.id));
};

const tokensOf = (calls: ModelCall[]): number | "unknown" => {
  let total = 0;
  for (const c of calls) {
    if (c.promptTokens === null || c.completionTokens === null) return UNKNOWN;
    total += c.promptTokens + c.completionTokens;
  }
  return total;
};

/** Earliest closure event per dock. */
const closures = (snapshot: RunSnapshot): Map<string, number> => {
  const byDock = new Map<string, number>();
  for (const e of snapshot.events) {
    const dockId = e.affectedIds[0];
    if (e.type !== "dock_closed_disruption" || dockId === undefined) continue;
    byDock.set(
      dockId,
      Math.min(byDock.get(dockId) ?? e.logicalTime, e.logicalTime),
    );
  }
  return byDock;
};

const clockAdvanced = (snapshot: RunSnapshot): boolean =>
  snapshot.events.length > 0 &&
  snapshot.logicalTime > Math.min(...snapshot.events.map((e) => e.logicalTime));

const doorHoursLost = (snapshot: RunSnapshot): number | "unknown" => {
  if (!clockAdvanced(snapshot)) return UNKNOWN;
  let seconds = 0;
  for (const [dockId, closedAt] of closures(snapshot)) {
    const dock = snapshot.engine.state.docks.find(([id]) => id === dockId)?.[1];
    if (dock?.status !== "closed") return UNKNOWN;
    seconds += snapshot.logicalTime - closedAt;
  }
  return seconds / SECONDS_PER_HOUR;
};

const driverWaitingSec = (snapshot: RunSnapshot): number | "unknown" => {
  if (!clockAdvanced(snapshot)) return UNKNOWN;
  const closedAt = closures(snapshot);
  const trailers = new Map(snapshot.engine.state.trailers);
  let seconds = 0;
  for (const agent of snapshot.agents) {
    if (agent.role !== "driver") continue;
    const moved = snapshot.events.some(
      (e) =>
        e.type === "trailer_moved" &&
        e.affectedIds.includes(agent.assignedEntityId),
    );
    if (moved) return UNKNOWN;
    const location = trailers.get(agent.assignedEntityId)?.location;
    const since =
      location?.kind === "dock" ? closedAt.get(location.dockId) : undefined;
    if (since !== undefined) seconds += snapshot.logicalTime - since;
  }
  return seconds;
};

export const computeMetrics = (snapshot: RunSnapshot): RunMetrics => {
  const counted = countedCalls(snapshot);
  return {
    driverWaitingSec: driverWaitingSec(snapshot),
    departureLatenessSec: UNKNOWN,
    doorHoursLost: doorHoursLost(snapshot),
    invalidProposals: snapshot.modelCalls.filter(
      (c) => c.outcome === "rejected",
    ).length,
    modelCalls: counted.length,
    tokens: tokensOf(counted),
  };
};
