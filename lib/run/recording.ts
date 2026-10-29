/**
 * Export and replay (plan Task A9). A recording holds every decision the
 * deliberators made plus the disruptions between them. Replay feeds them back
 * into a fresh Run through ReplayDeliberator: deterministic, headless, and it
 * never calls a model.
 */

import type { Deliberator, TurnDecision, TurnInput } from "../../types/run";
import { BaselineDeliberator } from "./baseline-deliberator";
import {
  type RecordedDecision,
  type RecordedRun,
  RecordedRunSchema,
} from "./recording-schema";
import { tierFor } from "./registry";
import { Run } from "./run";

export { type RecordedRun, RecordedRunSchema } from "./recording-schema";

export const exportRun = (run: Run, now: Date = new Date()): RecordedRun => {
  const snap = run.snapshot();
  const { decisions, disruptions } = run.recordingParts();
  const answered = snap.modelCalls.filter((c) => !c.isFallback);
  return {
    version: 1,
    scenarioId: "d108",
    recordedAt: now.toISOString(),
    models: [...new Set(answered.map((c) => c.model))],
    hasModelTurns: answered.some((c) => c.model !== "scripted"),
    decisions,
    disruptions,
    finalStateVersion: snap.stateVersion,
    events: snap.events,
    modelCalls: snap.modelCalls,
    finalEngine: snap.engine as unknown as Record<string, unknown>,
  };
};

/** Parse untrusted JSON into a RecordedRun; throws a ZodError on bad input. */
export const parseRecording = (input: unknown): RecordedRun =>
  RecordedRunSchema.parse(input);

/** Returns recorded decisions per agent, in order. Never touches the network. */
export class ReplayDeliberator implements Deliberator {
  readonly kind = "replay" as const;
  private readonly byAgent = new Map<string, TurnDecision[]>();
  private readonly cursors = new Map<string, number>();

  constructor(decisions: readonly RecordedDecision[]) {
    for (const { agentId, decision } of decisions) {
      const list = this.byAgent.get(agentId) ?? [];
      list.push(structuredClone(decision));
      this.byAgent.set(agentId, list);
    }
  }

  async decide(input: TurnInput): Promise<TurnDecision> {
    const agentId = input.agent.id;
    const index = this.cursors.get(agentId) ?? 0;
    const next = this.byAgent.get(agentId)?.[index];
    if (next) {
      this.cursors.set(agentId, index + 1);
      return structuredClone(next);
    }
    return {
      thought: "Recording exhausted; waiting.",
      call: {
        agentId,
        role: input.agent.role,
        tier: input.tier,
        model: "replay",
        isFallback: false,
        latencyMs: 0,
        promptTokens: null,
        completionTokens: null,
        logicalTime: input.logicalTime,
        stateVersion: input.stateVersion,
      },
    };
  }
}

/** Replays a recording headlessly in a fresh, unregistered Run. */
export const replayRun = async (
  recording: RecordedRun,
  runId = `replay-${recording.recordedAt}`,
): Promise<Run> => {
  const run = new Run({
    runId,
    mode: "replay",
    deliberator: new ReplayDeliberator(recording.decisions),
    fallbackDeliberator: new BaselineDeliberator(),
    tierFor,
  });
  const pending = [...recording.disruptions];
  const injectNext = (): void => {
    const next = pending.shift();
    if (next) run.injectDisruption(next.body);
  };
  for (;;) {
    while (pending[0] && pending[0].afterDecisions <= run.turnCount) {
      injectNext();
    }
    const before = run.turnCount;
    await run.step(1);
    if (run.turnCount === before) {
      if (pending.length === 0) break;
      injectNext();
    }
  }
  return run;
};
