import { describe, expect, it } from "vitest";
import type { AgentRole } from "@/lib/agents/types";
import { BaselineDeliberator } from "@/lib/run/baseline-deliberator";
import { Run } from "@/lib/run/run";
import { D108 } from "@/lib/run/scenarios/d108";
import { ScriptedDeliberator } from "@/lib/run/scripted-deliberator";
import type {
  Deliberator,
  ModelTier,
  RunSnapshot,
  TurnDecision,
} from "@/types/run";
import { calculateDashboardCounts } from "./data";
import { nextStatus, projectRun } from "./project-run";

const TIERS: Record<AgentRole, ModelTier> = {
  driver: "nano",
  dock_lead: "super",
  yard_controller: "super",
  supervisor: "ultra",
};

const makeRun = (deliberator: Deliberator): Run =>
  new Run({
    runId: "run-test",
    mode: "live",
    deliberator,
    fallbackDeliberator: new ScriptedDeliberator({}),
    tierFor: (role) => TIERS[role],
  });

const closeD108 = (run: Run): void => {
  run.injectDisruption({ type: "dock_closure", targetId: D108.closedDock });
};

const stepToDone = async (run: Run): Promise<RunSnapshot> => {
  for (let i = 0; i < 10 && run.snapshot().status !== "done"; i++) {
    await run.step(8);
  }
  return run.snapshot();
};

/** A Nemotron deliberator whose every reply fell back (e.g. no API key). */
const fallingBackNemotron: Deliberator = {
  kind: "nemotron",
  decide: async (input) => ({
    thought: "fallback: no key",
    call: {
      agentId: input.agent.id,
      role: input.agent.role,
      tier: input.tier,
      model: "nvidia/nemotron-3-super-120b-a12b",
      isFallback: true,
      fallbackReason: "no_api_key",
      latencyMs: 0,
      promptTokens: null,
      completionTokens: null,
      logicalTime: input.logicalTime,
      stateVersion: input.stateVersion,
    },
  }),
};

/** Baseline moves under a Nemotron label whose every call fell back. */
const fallingBackWithTools: Deliberator = {
  kind: "nemotron",
  decide: async (input) => {
    const d = await new BaselineDeliberator().decide(input);
    return {
      ...d,
      call: { ...d.call, isFallback: true, fallbackReason: "no_api_key" },
    };
  },
};

const scriptedCall = (): TurnDecision["call"] => ({
  agentId: "placeholder",
  role: "driver",
  tier: "nano",
  model: "scripted-model",
  isFallback: false,
  latencyMs: 1,
  promptTokens: null,
  completionTokens: null,
  logicalTime: 0,
  stateVersion: 0,
});

describe("projectRun", () => {
  it("counts come from the engine snapshot, not ILLUSTRATIVE_STATE", () => {
    const run = makeRun(new ScriptedDeliberator({}));
    closeD108(run);
    const view = projectRun(run.snapshot());

    // D-108 is closed (and still holds T-2291); P-061 holds T-3061.
    expect(view.counts.doorsBlocked).toBe(1);
    expect(view.counts.doorsOccupied).toBe(1);
    expect(view.counts.doorsFree).toBe(181);
    expect(view.counts.doorsServing).toBe(0);
    expect(view.counts.stallsOccupied).toBe(1);
    expect(view.counts.stallsFree).toBe(234);
    expect(view.counts.yardWaiting).toBe(1);
    expect(view.counts.trailersOnSite).toBe(2);
    expect(view.counts.gateQueue).toBe(0);
    // The engine does not model outbound dependencies: unknown, never 0.
    expect(view.counts.outboundBlocked).toBeNull();
    expect(view.counts).not.toEqual(calculateDashboardCounts());
    expect(view.clock).toBe("14:00:00");
  });

  it("keeps the S1 door identities when a snapshot omits docks", () => {
    const run = makeRun(new ScriptedDeliberator({}));
    closeD108(run);
    const snap = run.snapshot();
    const trimmed: RunSnapshot = {
      ...snap,
      engine: {
        ...snap.engine,
        state: {
          ...snap.engine.state,
          docks: snap.engine.state.docks.filter(([id]) => id === "D-108"),
          stalls: [],
        },
      },
    };
    const { counts } = projectRun(trimmed);
    expect(counts.doorsBlocked + counts.doorsFree).toBe(182);
    // P-061 still holds T-3061 by its trailer location.
    expect(counts.stallsFree).toBe(234);
  });

  it('timeline marks fallback calls as "fallback", never "nemotron"', async () => {
    const run = makeRun(fallingBackNemotron);
    closeD108(run);
    const snap = await stepToDone(run);
    expect(snap.modelCalls.length).toBeGreaterThan(0);

    // Even if a recording mislabels the event, the call's flag wins.
    const mislabeled: RunSnapshot = {
      ...snap,
      events: snap.events.map((e) =>
        e.kind === "model_call" ? { ...e, provenance: "nemotron" } : e,
      ),
    };
    for (const s of [snap, mislabeled]) {
      const view = projectRun(s);
      const turns = view.timeline.filter((t) => t.modelCallId !== undefined);
      expect(turns.length).toBe(snap.modelCalls.length);
      for (const t of turns) {
        expect(t.provenance).toBe("fallback");
        expect(t.tag).toBe("fallback");
        expect(t.isLLM).toBe(false);
      }
      expect(view.timeline.some((t) => t.provenance === "nemotron")).toBe(
        false,
      );
      expect(view.provenanceSummary).toEqual({
        nemotron: 0,
        testModel: 0,
        fallback: snap.modelCalls.length,
        baseline: 0,
        other: 0,
      });
    }
  });

  it("engine events caused by a fallback call keep engine provenance", async () => {
    const run = makeRun(fallingBackWithTools);
    closeD108(run);
    const snap = await stepToDone(run);
    expect(snap.status).toBe("done");
    const view = projectRun(snap);
    const caused = snap.events.filter(
      (e) =>
        e.kind === "engine" &&
        e.type !== "tool_rejected" &&
        snap.modelCalls.some((c) => c.id === e.causationId),
    );
    expect(caused.map((e) => e.type)).toContain("commitment_committed");
    for (const e of caused) {
      const t = view.timeline.find((x) => x.id === `RE-${e.seq}`);
      expect(t?.provenance).toBe("engine");
      expect(t?.tag).toBeUndefined();
    }
    const turns = view.timeline.filter((t) => t.modelCallId !== undefined);
    expect(turns.every((t) => t.provenance === "fallback")).toBe(true);
  });

  it("a refused disruption shows its reasonCode, not as injected", () => {
    const run = makeRun(new ScriptedDeliberator({}));
    run.injectDisruption({ type: "dock_closure", targetId: "D-999" });
    const view = projectRun(run.snapshot());
    const refused = view.timeline.filter((t) => t.reasonCode === "NOT_FOUND");
    expect(refused).toHaveLength(1);
    expect(refused[0]).toMatchObject({
      type: "stale",
      tag: "refused",
      provenance: "operator",
    });
    expect(refused[0]?.title).toContain("NOT_FOUND");
    expect(view.counts.doorsBlocked).toBe(0);
  });

  it("provenance buckets sum to the number of model calls", async () => {
    const replayKind: Deliberator = {
      kind: "replay",
      decide: async (input) => ({
        thought: "recorded",
        call: { ...scriptedCall(), agentId: input.agent.id },
      }),
    };
    const run = makeRun(replayKind);
    closeD108(run);
    const snap = await stepToDone(run);
    const { provenanceSummary: s } = projectRun(snap);
    expect(s.other).toBe(snap.modelCalls.length);
    expect(s.nemotron + s.fallback + s.baseline + s.other).toBe(
      snap.modelCalls.length,
    );
  });

  it("rejected outcomes appear in the timeline with their reasonCode", async () => {
    const run = makeRun(
      new ScriptedDeliberator({
        "DRV-047": [
          {
            thought: "driver tries to commit",
            toolCall: {
              tool: "commit",
              parameters: { commitmentId: "C-1", requestId: "REQ-X" },
            },
            call: scriptedCall(),
          },
        ],
      }),
    );
    closeD108(run);
    const view = projectRun(await stepToDone(run));

    const rejected = view.timeline.filter(
      (t) => t.reasonCode === "PERMISSION_DENIED",
    );
    expect(rejected.length).toBeGreaterThan(0);
    for (const t of rejected) {
      expect(t.type).toBe("stale");
      expect(t.title).toContain("PERMISSION_DENIED");
    }
    expect(
      view.lastCalls.some(
        (c) => c.outcome === "rejected" && c.reasonCode === "PERMISSION_DENIED",
      ),
    ).toBe(true);
  });

  it("passes engine commitments, agents and budget through, and unknown tokens stay null", async () => {
    const run = makeRun(new ScriptedDeliberator({}));
    closeD108(run);
    const snap = await stepToDone(run);
    const view = projectRun(snap);
    expect(view.agents.map((a) => a.id)).toEqual(snap.agents.map((a) => a.id));
    expect(view.budget).toEqual(snap.budget);
    expect(view.commitments).toEqual(
      snap.engine.state.commitments.map(([, c]) => c),
    );
    expect(view.lastCalls.every((c) => c.promptTokens === null)).toBe(true);
  });
});

describe("nextStatus", () => {
  it('a 404 from step sets status "missing"', () => {
    expect(nextStatus(404)).toBe("missing");
  });
  it("a 2xx response is ready", () => {
    expect(nextStatus(200)).toBe("ready");
  });
  it("a 409 RUN_BUSY keeps the run ready (state unchanged)", () => {
    expect(nextStatus(409)).toBe("ready");
  });
  it("other failures are errors", () => {
    expect(nextStatus(400)).toBe("error");
    expect(nextStatus(500)).toBe("error");
  });
});
