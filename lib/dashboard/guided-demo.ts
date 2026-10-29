/**
 * The guided D-108 flow (plan B5) as a pure async sequence over run actions:
 * start -> dock_closure on D-108 -> step until the run is done. It reports one
 * status line per step and stops at the first failure or when MAX_GUIDED_STEPS
 * is hit, so a stuck run cannot loop forever. Rendering and fetching stay out.
 */

import type { DisruptionBody } from "@/lib/run/api-schemas";
import type { RunActionResult } from "./run-state";

export const GUIDED_DISRUPTION: DisruptionBody = {
  type: "dock_closure",
  targetId: "D-108",
};

export const MAX_GUIDED_STEPS = 40;

export interface GuidedActions {
  start(): Promise<RunActionResult>;
  disrupt(body: DisruptionBody): Promise<RunActionResult>;
  step(): Promise<RunActionResult>;
}

export type GuidedOutcome = "done" | "failed" | "step_limit";

export interface GuidedResult {
  outcome: GuidedOutcome;
  /** Server code or client message when the outcome is failed. */
  error?: string;
}

const failed = (r: RunActionResult): boolean =>
  r.error !== null || r.snapshot === null || r.status === "error";

export const runGuidedDemo = async (
  actions: GuidedActions,
  onStatus: (line: string) => void,
): Promise<GuidedResult> => {
  onStatus("Starting a new run…");
  const started = await actions.start();
  if (failed(started)) {
    onStatus(`Could not start a run: ${started.error ?? "no snapshot"}`);
    return { outcome: "failed", error: started.error ?? "NO_SNAPSHOT" };
  }

  onStatus("Closing dock door D-108…");
  const disrupted = await actions.disrupt(GUIDED_DISRUPTION);
  if (failed(disrupted)) {
    onStatus(`Disruption failed: ${disrupted.error ?? "no snapshot"}`);
    return { outcome: "failed", error: disrupted.error ?? "NO_SNAPSHOT" };
  }

  for (let n = 1; n <= MAX_GUIDED_STEPS; n++) {
    onStatus(`Agents negotiating · step ${n}…`);
    const stepped = await actions.step();
    if (failed(stepped)) {
      onStatus(`Step ${n} failed: ${stepped.error ?? "no snapshot"}`);
      return { outcome: "failed", error: stepped.error ?? "NO_SNAPSHOT" };
    }
    if (stepped.snapshot?.status === "done") {
      onStatus(`Run complete after ${n} step${n === 1 ? "" : "s"}.`);
      return { outcome: "done" };
    }
  }
  onStatus(`Stopped after ${MAX_GUIDED_STEPS} steps without finishing.`);
  return { outcome: "step_limit" };
};
