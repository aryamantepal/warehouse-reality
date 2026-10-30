import { afterEach, describe, expect, it, vi } from "vitest";
import { GET as exportRoute } from "../../app/api/runs/[runId]/export/route";
import type { Deliberator, TurnDecision, TurnInput } from "../../types/run";
import { BaselineDeliberator } from "./baseline-deliberator";
import {
  exportRun,
  parseRecording,
  ReplayDeliberator,
  replayRun,
} from "./recording";
import { createRun, tierFor } from "./registry";
import { Run } from "./run";
import { D108 } from "./scenarios/d108";

afterEach(() => {
  vi.unstubAllGlobals();
});

// SYNTHETIC test source: wraps the FCFS baseline and stamps model ids and
// fallback flags, so recorded provenance can be checked. Not Nemotron output.
class StampingDeliberator implements Deliberator {
  readonly kind = "nemotron" as const;
  private n = 0;
  private readonly inner = new BaselineDeliberator();
  async decide(input: TurnInput): Promise<TurnDecision> {
    const d = await this.inner.decide(input);
    const fallback = ++this.n % 3 === 0;
    return {
      ...d,
      call: {
        ...d.call,
        model: fallback ? "baseline" : "synthetic-model-x",
        isFallback: fallback,
        fallbackReason: fallback ? "http_error" : undefined,
        promptTokens: fallback ? null : 7,
        completionTokens: fallback ? null : 3,
      },
    };
  }
}

const driveToDone = async (run: Run) => {
  run.injectDisruption({ type: "dock_closure", targetId: D108.closedDock });
  for (let i = 0; i < 12 && run.snapshot().status !== "done"; i++) {
    await run.step(8);
  }
  return run;
};

const liveRun = () =>
  new Run({
    runId: "live-1",
    mode: "live",
    deliberator: new StampingDeliberator(),
    fallbackDeliberator: new BaselineDeliberator(),
    tierFor,
  });

const roundTrip = (run: Run) =>
  parseRecording(JSON.parse(JSON.stringify(exportRun(run))));

describe("run recording", () => {
  it("replaying a recorded run reproduces the final engine snapshot exactly", async () => {
    const live = await driveToDone(liveRun());
    const recording = roundTrip(live);
    expect(recording.decisions.length).toBeGreaterThan(0);

    const replayed = await replayRun(recording);
    const a = live.snapshot();
    const b = replayed.snapshot();
    expect(b.engine).toEqual(a.engine);
    expect(b.stateVersion).toBe(recording.finalStateVersion);
    expect(b.modelCalls.length).toBe(a.modelCalls.length);
    expect(b.status).toBe("done");
  });

  it("replay is deterministic across repeated runs", async () => {
    const recording = roundTrip(await driveToDone(liveRun()));
    const one = (await replayRun(recording)).snapshot();
    const two = (await replayRun(recording)).snapshot();
    expect(two.engine).toEqual(one.engine);
    expect(two.events).toEqual(one.events);
    expect(two.modelCalls).toEqual(one.modelCalls);
  });

  it("replay makes zero network calls", async () => {
    const recording = roundTrip(await driveToDone(liveRun()));
    const fetchStub = vi.fn(() => {
      throw new Error("network is forbidden in replay");
    });
    vi.stubGlobal("fetch", fetchStub);
    await replayRun(recording);
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it("recorded model calls keep the original model id and isFallback flags", async () => {
    const live = await driveToDone(liveRun());
    const recording = roundTrip(live);
    expect(recording.modelCalls.some((c) => c.isFallback)).toBe(true);
    expect(recording.models).toEqual(["synthetic-model-x"]);

    const replayed = (await replayRun(recording)).snapshot();
    const pick = (calls: typeof replayed.modelCalls) =>
      calls.map((c) => [c.model, c.isFallback, c.promptTokens]);
    expect(pick(replayed.modelCalls)).toEqual(pick(recording.modelCalls));
  });

  it("round-trips through JSON without loss and keeps unknown tokens null", async () => {
    const recording = roundTrip(await driveToDone(liveRun()));
    expect(parseRecording(JSON.parse(JSON.stringify(recording)))).toEqual(
      recording,
    );
    const unknown = recording.modelCalls.filter((c) => c.isFallback);
    expect(unknown.length).toBeGreaterThan(0);
    for (const c of unknown) {
      expect(c.promptTokens).toBeNull();
      expect(c.completionTokens).toBeNull();
    }
  });

  it("rejects bad recordings", async () => {
    const good = JSON.parse(
      JSON.stringify(exportRun(await driveToDone(liveRun()))),
    );
    const bad: unknown[] = [
      null,
      { ...good, version: 2 },
      { ...good, scenarioId: "other" },
      { ...good, recordedAt: "yesterday" },
      { ...good, decisions: "nope" },
      { ...good, modelCalls: [{ ...good.modelCalls[0], promptTokens: -1 }] },
      { ...good, modelCalls: [{ ...good.modelCalls[0], tier: "huge" }] },
      { ...good, disruptions: [{ afterDecisions: 0, body: { type: "x" } }] },
    ];
    for (const input of bad) {
      expect(() => parseRecording(input)).toThrow();
    }
  });

  it("ReplayDeliberator waits once the recording runs out", async () => {
    const replay = new ReplayDeliberator([]);
    const live = liveRun();
    const input = {
      agent: live.snapshot().agents[0],
      tier: "nano",
      observation: {},
      inbox: [],
      stateVersion: 0,
      logicalTime: 0,
    } as TurnInput;
    const d = await replay.decide(input);
    expect(d.toolCall).toBeUndefined();
  });

  it("GET /api/runs/[runId]/export returns a valid recording, 404 when unknown", async () => {
    const run = createRun({ scenarioId: "d108", mode: "baseline" });
    await driveToDone(run);
    const ctx = (runId: string) => ({ params: Promise.resolve({ runId }) });
    const ok = await exportRoute(
      new Request("http://test"),
      ctx(run.snapshot().runId),
    );
    expect(ok.status).toBe(200);
    expect(parseRecording(await ok.json()).version).toBe(1);

    const missing = await exportRoute(new Request("http://test"), ctx("nope"));
    expect(missing.status).toBe(404);
  });
});
