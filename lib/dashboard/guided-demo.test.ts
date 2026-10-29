import { describe, expect, it, vi } from "vitest";
import type { RunSnapshot } from "@/types/run";
import {
  GUIDED_DISRUPTION,
  type GuidedActions,
  MAX_GUIDED_STEPS,
  runGuidedDemo,
} from "./guided-demo";
import type { RunActionResult } from "./run-state";

const snap = (status: RunSnapshot["status"]): RunActionResult => ({
  status: "ready",
  snapshot: { status } as RunSnapshot,
  error: null,
});
const failure = (code: string): RunActionResult => ({
  status: "error",
  snapshot: null,
  error: code,
});

const actions = (over: Partial<GuidedActions> = {}): GuidedActions => ({
  start: async () => snap("idle"),
  disrupt: async () => snap("idle"),
  step: async () => snap("done"),
  ...over,
});

describe("runGuidedDemo", () => {
  it("starts, closes D-108, then steps until done", async () => {
    const order: string[] = [];
    const steps = [snap("deliberating"), snap("deliberating"), snap("done")];
    const disrupt = vi.fn(async () => {
      order.push("disrupt");
      return snap("idle");
    });
    const result = await runGuidedDemo(
      actions({
        start: async () => {
          order.push("start");
          return snap("idle");
        },
        disrupt,
        step: async () => {
          order.push("step");
          return steps.shift() ?? snap("done");
        },
      }),
      () => {},
    );
    expect(result).toEqual({ outcome: "done" });
    expect(order).toEqual(["start", "disrupt", "step", "step", "step"]);
    expect(disrupt).toHaveBeenCalledWith(GUIDED_DISRUPTION);
    expect(GUIDED_DISRUPTION).toEqual({
      type: "dock_closure",
      targetId: "D-108",
    });
  });

  it("reports a status line per step", async () => {
    const lines: string[] = [];
    await runGuidedDemo(actions(), (l) => lines.push(l));
    expect(lines).toHaveLength(4);
    expect(lines.at(-1)).toMatch(/complete after 1 step/);
  });

  it("stops at a failed start and never disrupts", async () => {
    const disrupt = vi.fn(async () => snap("idle"));
    const result = await runGuidedDemo(
      actions({ start: async () => failure("HTTP_500"), disrupt }),
      () => {},
    );
    expect(result).toEqual({ outcome: "failed", error: "HTTP_500" });
    expect(disrupt).not.toHaveBeenCalled();
  });

  it("treats a refused disruption as a failure", async () => {
    const result = await runGuidedDemo(
      actions({
        disrupt: async () => ({
          ...snap("idle"),
          error: "DISRUPTION_REFUSED: NOT_FOUND",
        }),
      }),
      () => {},
    );
    expect(result.outcome).toBe("failed");
  });

  it("stops when the run goes missing mid-flow", async () => {
    const result = await runGuidedDemo(
      actions({
        step: async () => ({
          status: "missing",
          snapshot: null,
          error: "RUN_NOT_FOUND",
        }),
      }),
      () => {},
    );
    expect(result).toEqual({ outcome: "failed", error: "RUN_NOT_FOUND" });
  });

  it("gives up after the step limit", async () => {
    const step = vi.fn(async () => snap("deliberating"));
    const result = await runGuidedDemo(actions({ step }), () => {});
    expect(result.outcome).toBe("step_limit");
    expect(step).toHaveBeenCalledTimes(MAX_GUIDED_STEPS);
  });
});
