/**
 * Pure projection of a server-owned RunSnapshot into dashboard state (plan B3).
 * Counts come from the engine snapshot over the S1 identities (182 dock-high
 * doors, 235 stalls; ramps are not door counts); nothing here reads the
 * illustrative scene state.
 */

import type { AgentState } from "@/lib/agents/types";
import type {
  CommitmentEntity,
  DockEntity,
  EngineSnapshot,
  TrailerEntity,
} from "@/lib/engine/types";
import { doorId, S1, stallId } from "@/lib/scene/facility";
import type { DashboardCounts, TimelineEvent } from "@/types/dashboard";
import type {
  ModelCall,
  Provenance,
  RunBudget,
  RunEvent,
  RunSnapshot,
  RunSource,
} from "@/types/run";

/** Number of most recent model calls the view keeps. */
export const LAST_CALLS = 8;

export type RunStatus = "none" | "loading" | "ready" | "missing" | "error";

/** Engine-derived counts. `outboundBlocked` is null: the engine does not model it. */
export type RunCounts = Omit<DashboardCounts, "outboundBlocked"> & {
  outboundBlocked: number | null;
};

export interface RunTimelineEvent extends TimelineEvent {
  provenance: Provenance;
  reasonCode?: string;
  modelCallId?: string;
  sources?: RunSource[];
}

export interface DashboardView {
  clock: string;
  counts: RunCounts;
  timeline: RunTimelineEvent[];
  commitments: CommitmentEntity[];
  agents: AgentState[];
  lastCalls: ModelCall[];
  budget: RunBudget;
  /** Model calls by provenance; `other` (e.g. replay) keeps the sum equal to the call count. */
  provenanceSummary: {
    nemotron: number;
    testModel: number;
    fallback: number;
    baseline: number;
    other: number;
  };
}

/** Maps an HTTP status from /api/runs/** to the hook status. */
export const nextStatus = (httpStatus: number): RunStatus => {
  if (httpStatus >= 200 && httpStatus < 300) return "ready";
  if (httpStatus === 404) return "missing";
  // RUN_BUSY: another request is stepping the same run; our state is still valid.
  if (httpStatus === 409) return "ready";
  return "error";
};

const pad2 = (n: number): string => String(n).padStart(2, "0");

/** Logical time is seconds from midnight (50400 = 14:00:00). */
export const formatClock = (secs: number): string => {
  const total = Math.max(0, Math.floor(secs));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return `${pad2(h)}:${pad2(m)}:${pad2(total % 60)}`;
};

const range = <T>(n: number, f: (i: number) => T): T[] =>
  Array.from({ length: n }, (_, i) => f(i));

const DOOR_IDS = range(S1.dockDoors, doorId);
const STALL_IDS = range(S1.trailerSpaces, stallId);

const projectCounts = (engine: EngineSnapshot): RunCounts => {
  const docks = new Map(engine.state.docks);
  const stalls = new Map(engine.state.stalls);
  const trailers = engine.state.trailers.map(([, t]) => t);
  const trailerById = new Map(engine.state.trailers);
  const trailerAtDock = new Map<string, TrailerEntity>();
  const stallsHeld = new Set<string>();
  for (const t of trailers) {
    if (t.location.kind === "dock") trailerAtDock.set(t.location.dockId, t);
    if (t.location.kind === "stall") stallsHeld.add(t.location.stallId);
  }

  // A door the engine does not mention is free (S1 identity, no state).
  const doorState = (id: string) => {
    const dock: DockEntity | undefined = docks.get(id);
    const trailer =
      trailerAtDock.get(id) ??
      (dock?.occupiedTrailerId
        ? trailerById.get(dock.occupiedTrailerId)
        : undefined);
    const occupied = trailer !== undefined || Boolean(dock?.occupiedTrailerId);
    const closed = dock?.status === "closed";
    return {
      occupied,
      closed,
      serving: !closed && trailer?.status === "serving",
      free: (dock?.status ?? "free") === "free" && !occupied,
    };
  };
  const doors = DOOR_IDS.map(doorState);
  const stallOccupied = STALL_IDS.map(
    (id) => Boolean(stalls.get(id)?.occupiedTrailerId) || stallsHeld.has(id),
  );
  const atGate = (t: TrailerEntity) =>
    t.location.kind === "gate" || t.status === "gate";
  const occupiedStalls = stallOccupied.filter(Boolean).length;

  return {
    doorsOccupied: doors.filter((d) => d.occupied).length,
    doorsServing: doors.filter((d) => d.serving).length,
    doorsBlocked: doors.filter((d) => d.closed).length,
    doorsFree: doors.filter((d) => d.free).length,
    stallsOccupied: occupiedStalls,
    stallsFree: STALL_IDS.length - occupiedStalls,
    yardWaiting: trailers.filter((t) => t.status === "waiting").length,
    gateQueue: trailers.filter(atGate).length,
    outboundBlocked: null,
    trailersOnSite: trailers.filter((t) => !atGate(t)).length,
  };
};

/** A fallback call is never labelled nemotron, whatever the event says. */
const callProvenance = (
  call: ModelCall,
  eventProvenance: Provenance | undefined,
): Provenance | undefined => {
  if (eventProvenance === "baseline") return "baseline";
  if (call.isFallback) return "fallback";
  return eventProvenance;
};

const TOOL_TYPE: Partial<
  Record<NonNullable<ModelCall["toolName"]>, TimelineEvent["type"]>
> = {
  propose: "offer",
  accept: "accept",
  commit: "commit",
};

const MESSAGE_TYPE: Record<string, TimelineEvent["type"]> = {
  offer: "offer",
  accept: "accept",
};

const ENGINE_TYPE: Record<string, TimelineEvent["type"]> = {
  commitment_committed: "commit",
  tool_rejected: "stale",
  dock_closed_disruption: "disruption",
};

// Run.injectDisruption records a refusal only in the summary, with HTTP 200.
const REFUSED = / refused: ([A-Z_]+)$/;

/** The engine reasonCode of a refused disruption, or undefined if it applied. */
export const refusedDisruptionCode = (e: RunEvent): string | undefined =>
  e.kind === "disruption" ? REFUSED.exec(e.summary)?.[1] : undefined;

const timelineType = (
  e: RunEvent,
  call: ModelCall | undefined,
): TimelineEvent["type"] => {
  switch (e.kind) {
    case "disruption":
      return refusedDisruptionCode(e) ? "stale" : "disruption";
    case "model_call":
      if (call?.outcome === "rejected") return "stale";
      return (call?.toolName && TOOL_TYPE[call.toolName]) ?? "action";
    case "message":
      return MESSAGE_TYPE[e.type] ?? "action";
    case "escalation":
      return "action";
    case "engine":
      return ENGINE_TYPE[e.type] ?? "engine";
  }
};

const sourceOf = (e: RunEvent): string => {
  if (e.actorId) return e.actorId;
  if (e.kind === "engine") return `engine v${e.stateVersion}`;
  return e.provenance;
};

const tagFor = (e: RunEvent): string | undefined => {
  if (e.kind === "disruption") return "injected";
  if (e.kind === "escalation") return "escalation";
  return undefined;
};

const projectEvent = (
  e: RunEvent,
  callsById: ReadonlyMap<string, ModelCall>,
): RunTimelineEvent => {
  const call = e.causationId ? callsById.get(e.causationId) : undefined;
  const isTurn = e.kind === "model_call" && call !== undefined;
  // Only the turn and its tool_rejected mirror speak for the call; engine
  // events it caused keep their own provenance.
  const mirrorsCall =
    isTurn || (call !== undefined && e.type === "tool_rejected");
  const provenance =
    call && mirrorsCall
      ? (callProvenance(call, e.provenance) ?? e.provenance)
      : e.provenance;
  const refusedCode = refusedDisruptionCode(e);
  const reasonCode =
    refusedCode ??
    (call?.outcome === "rejected" && mirrorsCall ? call.reasonCode : undefined);
  const title =
    reasonCode && !e.summary.includes(reasonCode)
      ? `${e.summary} · ${reasonCode}`
      : e.summary;
  const tag = isTurn
    ? provenance
    : refusedCode
      ? "refused"
      : (reasonCode ?? tagFor(e));
  return {
    id: `RE-${e.seq}`,
    time: formatClock(e.logicalTime),
    source: sourceOf(e),
    title,
    type: timelineType(e, call),
    ...(tag ? { tag } : {}),
    isLLM: isTurn && (provenance === "nemotron" || provenance === "test_model"),
    provenance,
    ...(reasonCode ? { reasonCode } : {}),
    ...(isTurn ? { modelCallId: call.id } : {}),
    ...(e.sources ? { sources: e.sources } : {}),
  };
};

const summarize = (
  calls: readonly ModelCall[],
  eventByCall: ReadonlyMap<string, Provenance>,
): DashboardView["provenanceSummary"] => {
  const summary = {
    nemotron: 0,
    testModel: 0,
    fallback: 0,
    baseline: 0,
    other: 0,
  };
  for (const c of calls) {
    const p = callProvenance(c, eventByCall.get(c.id));
    const bucket =
      p === "test_model"
        ? "testModel"
        : p === "nemotron" || p === "fallback" || p === "baseline"
          ? p
          : "other";
    summary[bucket] += 1;
  }
  return summary;
};

export const projectRun = (s: RunSnapshot): DashboardView => {
  const callsById = new Map(s.modelCalls.map((c) => [c.id, c]));
  const eventByCall = new Map<string, Provenance>();
  for (const e of s.events) {
    if (e.kind === "model_call" && e.causationId) {
      eventByCall.set(e.causationId, e.provenance);
    }
  }
  return {
    clock: formatClock(s.logicalTime),
    counts: projectCounts(s.engine),
    timeline: s.events.map((e) => projectEvent(e, callsById)),
    commitments: s.engine.state.commitments.map(([, c]) => c),
    agents: s.agents,
    lastCalls: s.modelCalls.slice(-LAST_CALLS),
    budget: s.budget,
    provenanceSummary: summarize(s.modelCalls, eventByCall),
  };
};
