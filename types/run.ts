/**
 * Shared run contract (plan Task 0). Both lanes code against these types.
 * Owned by Person A; change only after telling Person B.
 */

import type {
  AgentMessage,
  AgentRole,
  AgentState,
  AgentToolCall,
} from "@/lib/agents/types";
import type { EngineSnapshot } from "@/lib/engine/types";
import type { RunSource } from "@/lib/run/api-schemas";

export type { RunSource };

export type ModelTier = "nano" | "super" | "ultra";

export type Provenance =
  | "engine"
  | "nemotron"
  | "test_model"
  | "fallback"
  | "baseline"
  | "operator"
  | "external_search"
  | "replay";

export type FallbackReason =
  | "no_api_key"
  | "http_error"
  | "timeout"
  | "malformed_tool_call"
  | "budget_exhausted";

/** Which API answered. "anthropic" is a test model and is never Nemotron. */
export type ModelProvider = "nebius" | "anthropic";

export interface ModelCall {
  id: string;
  agentId: string;
  role: AgentRole;
  tier: ModelTier;
  model: string;
  /** Absent on older recordings; treated as nebius. */
  provider?: ModelProvider;
  isFallback: boolean;
  fallbackReason?: FallbackReason;
  latencyMs: number;
  // null when the provider did not report usage; never guessed.
  promptTokens: number | null;
  completionTokens: number | null;
  logicalTime: number;
  stateVersion: number;
  toolName?: AgentToolCall["tool"];
  outcome: "accepted" | "rejected" | "no_tool";
  reasonCode?: string;
}

export interface RunEvent {
  seq: number;
  logicalTime: number;
  stateVersion: number;
  kind: "engine" | "message" | "model_call" | "disruption" | "escalation";
  type: string;
  actorId?: string;
  affectedIds: string[];
  summary: string;
  causationId?: string;
  provenance: Provenance;
  sources?: RunSource[];
}

export interface RunBudget {
  calls: number;
  tokens: number;
  capCalls: 60;
  capTokens: 150000;
  exhausted: boolean;
}

export interface RunSnapshot {
  runId: string;
  mode: "live" | "baseline" | "replay";
  scenarioId: "d108";
  status: "idle" | "deliberating" | "done" | "error";
  logicalTime: number;
  stateVersion: number;
  engine: EngineSnapshot;
  agents: AgentState[];
  events: RunEvent[];
  modelCalls: ModelCall[];
  budget: RunBudget;
}

export interface StepResult {
  snapshot: RunSnapshot;
  newEvents: RunEvent[];
}

export interface TurnInput {
  agent: AgentState;
  tier: ModelTier;
  observation: Record<string, unknown>;
  inbox: AgentMessage[];
  stateVersion: number;
  logicalTime: number;
}

export interface TurnDecision {
  thought: string;
  toolCall?: AgentToolCall;
  call: Omit<ModelCall, "id" | "outcome" | "reasonCode" | "toolName">;
}

export interface Deliberator {
  readonly kind: "nemotron" | "baseline" | "scripted" | "replay";
  decide(input: TurnInput): Promise<TurnDecision>;
}
