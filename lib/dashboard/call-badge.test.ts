import { describe, expect, it } from "vitest";
import type { ModelCall } from "@/types/run";
import {
  budgetFractions,
  callBadgeOf,
  callSource,
  formatLatency,
  formatTokens,
  provenanceOfCall,
} from "./call-badge";
import type { RunTimelineEvent } from "./project-run";

const call = (over: Partial<ModelCall> = {}): ModelCall => ({
  id: "MC-1",
  agentId: "DRV-047",
  role: "driver",
  tier: "nano",
  model: "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B",
  isFallback: false,
  latencyMs: 840,
  promptTokens: 1000,
  completionTokens: 200,
  logicalTime: 50400,
  stateVersion: 3,
  outcome: "accepted",
  ...over,
});

describe("call badge", () => {
  it("labels a real model call nemotron with model, tier, latency and tokens", () => {
    expect(callBadgeOf(call(), "nemotron")).toMatchObject({
      source: "nemotron",
      label: "nemotron",
      tier: "nano",
      latency: "840 ms",
      tokens: "1200 tok",
    });
  });

  it("never shows a fallback as nemotron, even if the event says nemotron", () => {
    const c = call({ isFallback: true, fallbackReason: "timeout" });
    expect(callSource(c, "nemotron")).toBe("fallback");
    expect(callBadgeOf(c, "nemotron").fallbackReason).toBe("timeout");
  });

  it("labels baseline turns baseline", () => {
    expect(callSource(call({ model: "baseline-fcfs" }), "baseline")).toBe(
      "baseline",
    );
  });

  it("does not claim nemotron without a nemotron provenance", () => {
    expect(callSource(call(), undefined)).toBe("other");
    expect(callBadgeOf(call(), "replay").label).toBe("replay");
  });

  it("shows unreported usage as unknown, not 0", () => {
    expect(formatTokens(call({ promptTokens: null }))).toBe("unknown");
    expect(formatTokens(call({ completionTokens: null }))).toBe("unknown");
  });

  it("formats latency in ms and seconds", () => {
    expect(formatLatency(999)).toBe("999 ms");
    expect(formatLatency(1500)).toBe("1.5 s");
  });

  it("finds a call's provenance through the timeline", () => {
    const timeline = [
      { id: "RE-1", modelCallId: "MC-1", provenance: "baseline" },
    ] as RunTimelineEvent[];
    expect(provenanceOfCall(call(), timeline)).toBe("baseline");
    expect(provenanceOfCall(call({ id: "MC-9" }), timeline)).toBeUndefined();
  });

  it("clamps budget fractions to the caps", () => {
    expect(
      budgetFractions({
        calls: 30,
        tokens: 300000,
        capCalls: 60,
        capTokens: 150000,
      }),
    ).toEqual({ calls: 0.5, tokens: 1 });
  });
});
