import {
  ILLUSTRATIVE_STATE,
  MOVING_TRAILER,
} from "@/lib/scene/illustrative-state";
import type { DoorStatus, Entity, SceneState } from "@/lib/scene/types";
import type {
  DashboardCounts,
  Dependency,
  EvidenceRecord,
  TimelineEvent,
} from "@/types/dashboard";

export const LOGICAL_TIME = "14:07:30";

export const DEPENDENCIES: readonly Dependency[] = [
  {
    door: "D-027",
    trailer: "T-2027",
    shipment: "SH-5512",
    heldBy: MOVING_TRAILER,
    reason: "13 pallets still on board",
  },
  {
    door: "D-074",
    trailer: "T-2074",
    shipment: "SH-5530",
    heldBy: null,
    reason: "picking in staging lane S-06",
  },
  {
    door: "D-153",
    trailer: "T-2153",
    shipment: "SH-5547",
    heldBy: "T-3061",
    reason: "inbound, in P-061 waiting for a door",
  },
];

export const UNKNOWN_DFW_FIELDS: readonly string[] = [
  "daily truck visits",
  "time-of-day arrivals",
  "trailer occupancy",
  "forklifts",
  "yard tractors",
  "workers / shift",
  "crew composition",
  "carrier count",
  "dock direction split",
  "service durations",
  "transfer routes",
  "gate capacity",
  "movement speeds",
  "operating priorities",
];

export const EVIDENCE_RECORDS: readonly EvidenceRecord[] = [
  {
    id: "EV-01",
    title: "Scenario truck visits/day ≈117",
    kind: "drv",
    scope:
      "Scenario workload input. Other buildings, not a DFW observation. DFW daily truck visits stay unknown.",
    source:
      'ITE/NAIOP, "High-Cube Warehouse Vehicle Trip Generation Analysis", prepared for SCAQMD and NAIOP',
    url: "http://newpromisefarms.com/files/2018/07/HighCube-Warehouse-Oct-2016-Study-ITE.pdf",
    dates: "Published Oct 2016 · retrieved 2026-10-11",
    table:
      "Table 5, weighted average daily trips per 1,000 GSF, 5+ axle trucks",
    original:
      "0.233 trip ends / 1,000 GSF · Transload & Short-Term Storage (91 sites)",
    formula:
      "0.233 × 1,000.584 (S1 GSF ÷ 1,000) = 233.1 trip ends ÷ 2 = 116.6 visits",
    qualifier: "approximately; tractor-trailer visits per day",
    crossCheck:
      "Fulfillment Center (1 site, counted in December holiday season) 0.242 → ≈121",
  },
  {
    id: "EV-02",
    title: "Dock-high doors 182",
    kind: "src",
    scope: "DFW Commerce Center Building I only",
    source: "https://www.dfwcommercecenter.com/features",
    url: "https://www.dfwcommercecenter.com/features",
    dates: "Publication date not provided · retrieved 2026-10-11",
    qualifier: "physical capacity, not trucks present",
  },
  {
    id: "EV-03",
    title: "D-108 closed 14:00–16:00",
    kind: "hyp",
    scope:
      "Operator-injected hypothetical disruption (H-1) in this branch, not an observed event",
    source: "Rehearsal intervention",
    qualifier: "hypothetical disruption",
  },
];

export const TIMELINE_EVENTS: readonly TimelineEvent[] = [
  {
    id: "E-5120",
    time: "14:00:00",
    source: "DISRUPTION H-1",
    title: "D-108 closed 14:00–16:00",
    type: "disruption",
    tag: "injected",
  },
  {
    id: "E-5121",
    time: "14:00:00",
    source: "engine",
    title: "Service paused at D-108",
    type: "engine",
  },
  {
    id: "A-894",
    time: "14:01:30",
    source: "YARD-1",
    title: "Request D-109 · STALE_VERSION",
    type: "stale",
  },
  {
    id: "M-311",
    time: "14:02:40",
    source: "DOCK-C → DRV-047",
    title: "Offer D-112 14:20–15:05",
    type: "offer",
  },
  {
    id: "M-312",
    time: "14:04:40",
    source: "DRV-047",
    title: "Accept offer M-311",
    type: "accept",
    isLLM: true,
  },
  {
    id: "C-88",
    time: "14:05:02",
    source: "engine v3815",
    title: "Committed atomically",
    type: "commit",
  },
  {
    id: "A-902",
    time: "14:06:10",
    source: "YT-2",
    title: "Move T-2291 D-108 → D-112 started",
    type: "action",
  },
  {
    id: "SCH-01",
    time: "14:20:00",
    source: "scheduled",
    title: "T-2291 arrival at D-112 · window 14:20",
    type: "scheduled",
  },
];

const count = <T>(list: readonly T[], pred: (item: T) => boolean): number =>
  list.filter(pred).length;

export const calculateDashboardCounts = (): DashboardCounts => {
  const { doors, stalls, trailers } = ILLUSTRATIVE_STATE;
  return {
    doorsOccupied: count(doors, (d) => Boolean(d.trailer)),
    doorsServing: count(doors, (d) => d.status === "serving"),
    doorsBlocked: count(doors, (d) => d.status === "blocked"),
    doorsFree: count(doors, (d) => d.status === "free"),
    stallsOccupied: count(stalls, (s) => Boolean(s.trailer)),
    stallsFree: count(stalls, (s) => !s.trailer),
    yardWaiting: count(trailers, (t) => t.status === "waiting"),
    gateQueue: count(trailers, (t) => t.status === "gate"),
    outboundBlocked: DEPENDENCIES.length,
    trailersOnSite: count(trailers, (t) => t.status !== "gate"),
  };
};

/** Ids of the doors (not ramps) in one status, e.g. the closed ones. */
export const doorIdsWithStatus = (
  state: SceneState,
  status: DoorStatus,
): string[] => state.doors.filter((d) => d.status === status).map((d) => d.id);

export const getEntitiesForFilter = (
  filter: "doors" | "stalls" | "trailers" | "equipment",
  state: SceneState = ILLUSTRATIVE_STATE,
): readonly Entity[] => {
  switch (filter) {
    case "doors":
      return [...state.doors, ...state.ramps];
    case "stalls":
      return state.stalls;
    case "trailers":
      return state.trailers;
    case "equipment":
      return [...state.tractors, ...state.forklifts];
  }
};
