import { describe, expect, it } from "vitest";
import { createRun } from "@/lib/run/registry";
import { D108 } from "@/lib/run/scenarios/d108";
import type { RunSnapshot } from "@/types/run";
import { buildComparison } from "./compare";

const runDone = async (mode: "live" | "baseline"): Promise<RunSnapshot> => {
  const run = createRun({ scenarioId: "d108", mode });
  run.injectDisruption({ type: "dock_closure", targetId: D108.closedDock });
  for (let i = 0; i < 12 && run.snapshot().status !== "done"; i++) {
    await run.step(8);
  }
  return run.snapshot();
};

describe("buildComparison", () => {
  it("labels both sides as first-come when no model answered", async () => {
    // No NEBIUS_API_KEY in tests: the live run falls back for every turn.
    const c = buildComparison(await runDone("live"), await runDone("baseline"));
    expect(c.provenance.kind).toBe("all_baseline");
    expect(c.agentsModels).toBe("none answered");
    expect(c.incomplete).toBe(false);
  });

  it("has every metric row and never renders unknown as 0", async () => {
    const base = await runDone("baseline");
    const c = buildComparison(base, base);
    expect(c.rows.map((r) => r.key)).toEqual([
      "driverWaitingSec",
      "departureLatenessSec",
      "doorHoursLost",
      "invalidProposals",
      "modelCalls",
      "tokens",
    ]);
    const lateness = c.rows.find((r) => r.key === "departureLatenessSec");
    expect(lateness?.agents).toBe("unknown");
    expect(lateness?.baseline).toBe("unknown");
  });

  it("flags unfinished runs as incomplete", () => {
    const run = createRun({ scenarioId: "d108", mode: "baseline" });
    const early = run.snapshot();
    expect(buildComparison(early, early).incomplete).toBe(true);
  });
});
