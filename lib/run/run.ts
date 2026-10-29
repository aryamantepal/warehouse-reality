/**
 * Server-owned run: one authoritative engine, the agent registry, a wake
 * queue, and a model-call budget. Agents act only through engine tool calls.
 */

import type {
  Deliberator,
  ModelCall,
  ModelTier,
  Provenance,
  RunBudget,
  RunEvent,
  RunSnapshot,
  StepResult,
  TurnInput,
} from "../../types/run";
import { AgentRunner } from "../agents/agent-runner";
import type { AgentRole } from "../agents/types";
import { SimulationEngine } from "../engine/engine";
import type { DisruptionBody } from "./api-schemas";
import type { RecordedDecision, RecordedDisruption } from "./recording-schema";
import { seedD108 } from "./scenarios/d108";
import { affectedAgentIds, runTool, type ToolOutcome } from "./turns";

export interface RunOptions {
  runId: string;
  mode: "live" | "baseline" | "replay";
  deliberator: Deliberator;
  fallbackDeliberator: Deliberator;
  tierFor: (role: AgentRole) => ModelTier;
  /** Starting spend, for resuming or testing the cap. */
  initialBudget?: { calls?: number; tokens?: number };
}

const CAP_CALLS = 60;
const CAP_TOKENS = 150000;
const SUPERVISOR = "SUP-1";

const provenanceOf = (
  kind: Deliberator["kind"],
  isFallback: boolean,
  exhausted: boolean,
): Provenance => {
  if (exhausted || kind === "baseline") return "baseline";
  if (isFallback) return "fallback";
  return kind === "nemotron" ? "nemotron" : "replay";
};

export class Run {
  private readonly engine = new SimulationEngine();
  private readonly runner = new AgentRunner();
  private readonly events: RunEvent[] = [];
  private readonly modelCalls: ModelCall[] = [];
  private readonly queue: string[] = [];
  private readonly read = new Map<string, number>();
  private readonly proposers = new Map<string, string>();
  private readonly budget: RunBudget;
  private engineCursor = 0;
  private commitmentCounter = 0;
  private disruptionCounter = 0;
  private turns = 0;
  private readonly decisionLog: RecordedDecision[] = [];
  private readonly disruptionLog: RecordedDisruption[] = [];
  private running = false;
  private failed = false;

  constructor(private readonly opts: RunOptions) {
    seedD108(this.engine);
    for (const a of this.runner.getAllAgents()) {
      a.inbox = [];
      a.outbox = [];
      a.memory = [];
    }
    this.budget = {
      calls: opts.initialBudget?.calls ?? 0,
      tokens: opts.initialBudget?.tokens ?? 0,
      capCalls: CAP_CALLS,
      capTokens: CAP_TOKENS,
      exhausted: false,
    };
    this.flushEngineEvents();
  }

  get busy(): boolean {
    return this.running;
  }

  get turnCount(): number {
    return this.turns;
  }

  /** Raw material for `exportRun`; deep-copied so callers cannot mutate the run. */
  recordingParts(): {
    decisions: RecordedDecision[];
    disruptions: RecordedDisruption[];
  } {
    return structuredClone({
      decisions: this.decisionLog,
      disruptions: this.disruptionLog,
    });
  }

  snapshot(): RunSnapshot {
    return this.build(this.running);
  }

  private build(deliberating: boolean): RunSnapshot {
    const status = deliberating
      ? "deliberating"
      : this.failed
        ? "error"
        : this.queue.length === 0 && this.turns > 0
          ? "done"
          : "idle";
    return structuredClone({
      runId: this.opts.runId,
      mode: this.opts.mode,
      scenarioId: "d108" as const,
      status,
      logicalTime: this.engine.getLogicalTime(),
      stateVersion: this.engine.getStateVersion(),
      engine: this.engine.createCheckpoint(),
      agents: this.runner.getAllAgents(),
      events: this.events,
      modelCalls: this.modelCalls,
      budget: this.budget,
    });
  }

  injectDisruption(body: DisruptionBody): StepResult {
    if (this.running) throw new Error("RUN_BUSY");
    const start = this.events.length;
    this.disruptionLog.push({
      afterDecisions: this.turns,
      body: structuredClone(body),
    });
    const disruptionId = `H-${++this.disruptionCounter}`;
    const result =
      body.type === "external_delay"
        ? undefined
        : this.engine.injectDisruption(disruptionId, body.type, body.targetId);
    const applied = result?.success ?? body.type === "external_delay";
    this.record({
      kind: "disruption",
      type: body.type,
      affectedIds: [body.targetId],
      summary: applied
        ? `${body.type} on ${body.targetId} (${disruptionId})`
        : `${body.type} on ${body.targetId} refused: ${result?.reasonCode}`,
      provenance: body.sources?.length ? "external_search" : "operator",
      sources: body.sources,
    });
    this.flushEngineEvents();
    if (applied) {
      const agents = this.runner.getAllAgents();
      for (const id of affectedAgentIds(this.engine, agents, body.targetId)) {
        this.wake(id);
      }
    }
    return { snapshot: this.snapshot(), newEvents: this.events.slice(start) };
  }

  step(maxTurns: number): Promise<StepResult> {
    if (this.running) return Promise.reject(new Error("RUN_BUSY"));
    this.running = true;
    return this.runTurns(maxTurns).finally(() => {
      this.running = false;
    });
  }

  private async runTurns(maxTurns: number): Promise<StepResult> {
    const start = this.events.length;
    this.failed = false;
    try {
      for (let i = 0; i < maxTurns; i++) {
        const agentId = this.queue[0];
        if (agentId === undefined) break;
        await this.turn(agentId);
      }
    } catch (error) {
      this.failed = true;
      throw error;
    }
    return { snapshot: this.build(false), newEvents: this.events.slice(start) };
  }

  private async turn(agentId: string): Promise<void> {
    const agent = this.runner.getAgent(agentId);
    if (!agent) {
      this.queue.shift();
      return;
    }
    this.checkBudget();
    const exhausted = this.budget.exhausted;
    const deliberator = exhausted
      ? this.opts.fallbackDeliberator
      : this.opts.deliberator;
    const logicalTime = this.engine.getLogicalTime();
    const stateVersion = this.engine.getStateVersion();
    const tier = this.opts.tierFor(agent.role);
    const seen = this.read.get(agentId) ?? 0;
    const input: TurnInput = {
      agent: structuredClone(agent),
      tier,
      observation: this.engine.observe(agent.role, agent.assignedEntityId),
      inbox: structuredClone(agent.inbox.slice(seen)),
      stateVersion,
      logicalTime,
    };
    const decision = await deliberator.decide(input);
    // Commit the dequeue and the read cursor only once deciding succeeded, so a
    // throw leaves the agent queued with its unread inbox.
    this.queue.shift();
    this.read.set(agentId, agent.inbox.length);
    this.turns += 1;
    this.decisionLog.push({ agentId, decision: structuredClone(decision) });
    this.countSpend(deliberator.kind, decision.call);

    const outcome = runTool(decision.toolCall, {
      engine: this.engine,
      agent,
      nextCommitmentId: () => `C-${++this.commitmentCounter}`,
      proposers: this.proposers,
    });
    const isFallback = decision.call.isFallback || exhausted;
    const provenance = provenanceOf(deliberator.kind, isFallback, exhausted);
    const call: ModelCall = {
      ...decision.call,
      id: `MC-${this.modelCalls.length + 1}`,
      agentId,
      role: agent.role,
      tier,
      logicalTime,
      stateVersion,
      isFallback,
      fallbackReason: exhausted
        ? (decision.call.fallbackReason ?? "budget_exhausted")
        : decision.call.fallbackReason,
      toolName: decision.toolCall?.tool,
      outcome: outcome.outcome,
      reasonCode: outcome.reasonCode,
    };
    this.modelCalls.push(call);
    this.recordTurn(call, decision.thought, outcome, provenance);
    if (outcome.wakeSelf) this.wake(agentId);
  }

  private recordTurn(
    call: ModelCall,
    thought: string,
    outcome: ToolOutcome,
    provenance: Provenance,
  ): void {
    const tool = call.toolName ?? "no tool";
    this.record({
      kind: "model_call",
      type: "agent_turn",
      actorId: call.agentId,
      affectedIds: [call.agentId],
      summary: `${call.agentId} ${tool}: ${outcome.outcome} - ${thought}`,
      causationId: call.id,
      provenance,
    });
    this.flushEngineEvents(call.agentId, call.id);
    if (outcome.outcome === "rejected") {
      this.record({
        kind: "engine",
        type: "tool_rejected",
        actorId: call.agentId,
        affectedIds: [call.agentId],
        summary: `${tool} rejected ${outcome.reasonCode}: ${outcome.message}`,
        causationId: call.id,
        provenance,
      });
    }
    for (const m of outcome.messages) {
      const sent = this.runner.sendMessage(
        call.agentId,
        m.to,
        m.purpose,
        m.payload,
        this.engine.getLogicalTime(),
      );
      this.record({
        kind: m.purpose === "escalate" ? "escalation" : "message",
        type: m.purpose,
        actorId: call.agentId,
        affectedIds: [call.agentId, m.to],
        summary: `${call.agentId} -> ${m.to}: ${m.purpose}`,
        causationId: sent.id,
        provenance,
      });
      this.wake(m.to);
    }
  }

  private checkBudget(): void {
    const b = this.budget;
    if (b.exhausted || (b.calls < CAP_CALLS && b.tokens < CAP_TOKENS)) return;
    b.exhausted = true;
    this.record({
      kind: "escalation",
      type: "budget_exhausted",
      actorId: SUPERVISOR,
      affectedIds: [SUPERVISOR],
      summary: "budget reached, baseline takes over",
      provenance: "engine",
    });
  }

  /** Only the primary model deliberator spends budget; unknown tokens add nothing. */
  private countSpend(
    kind: Deliberator["kind"],
    usage: Pick<ModelCall, "promptTokens" | "completionTokens">,
  ): void {
    if (this.budget.exhausted || kind === "baseline" || kind === "replay")
      return;
    this.budget.calls += 1;
    this.budget.tokens +=
      (usage.promptTokens ?? 0) + (usage.completionTokens ?? 0);
  }

  private wake(agentId: string): void {
    if (this.runner.getAgent(agentId) && !this.queue.includes(agentId)) {
      this.queue.push(agentId);
    }
  }

  private flushEngineEvents(actorId?: string, causationId?: string): void {
    const log = this.engine.getEventLog();
    for (const e of log.slice(this.engineCursor)) {
      this.record({
        kind: "engine",
        type: e.type,
        logicalTime: e.logicalTime,
        stateVersion: e.stateVersion,
        actorId,
        affectedIds: [...e.affectedIds],
        summary: `${e.type}: ${e.affectedIds.join(", ")}`,
        causationId,
        provenance: "engine",
      });
    }
    this.engineCursor = log.length;
  }

  private record(
    e: Omit<RunEvent, "seq" | "logicalTime" | "stateVersion"> &
      Partial<Pick<RunEvent, "logicalTime" | "stateVersion">>,
  ): void {
    this.events.push({
      ...e,
      seq: this.events.length + 1,
      logicalTime: e.logicalTime ?? this.engine.getLogicalTime(),
      stateVersion: e.stateVersion ?? this.engine.getStateVersion(),
    });
  }
}
