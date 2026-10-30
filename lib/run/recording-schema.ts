/**
 * Zod schema for a recorded run (plan Task A9). Kept free of app imports (only
 * zod and a sibling schema file) so scripts/record-run.ts can validate with
 * plain Node. Unknown token usage stays null, never 0.
 */

import { z } from "zod";
import { DisruptionBody } from "./api-schemas.ts";

const Tool = z.enum([
  "propose",
  "accept",
  "commit",
  "executeMove",
  "executeUnload",
  "injectDisruption",
  "cancel",
  "escalate",
  "observe",
]);
const Role = z.enum(["driver", "dock_lead", "yard_controller", "supervisor"]);
const Tier = z.enum(["nano", "super", "ultra"]);
const Reason = z.enum([
  "no_api_key",
  "http_error",
  "timeout",
  "malformed_tool_call",
  "budget_exhausted",
]);
const Tokens = z.number().int().nonnegative().nullable();

const CallBase = z.object({
  agentId: z.string().min(1),
  role: Role,
  tier: Tier,
  model: z.string().min(1),
  provider: z.enum(["nebius", "anthropic"]).optional(),
  isFallback: z.boolean(),
  fallbackReason: Reason.optional(),
  latencyMs: z.number().nonnegative(),
  promptTokens: Tokens,
  completionTokens: Tokens,
  logicalTime: z.number(),
  stateVersion: z.number().int().nonnegative(),
});

export const RecordedDecisionSchema = z.object({
  agentId: z.string().min(1),
  decision: z.object({
    thought: z.string(),
    toolCall: z
      .object({ tool: Tool, parameters: z.record(z.string(), z.unknown()) })
      .optional(),
    call: CallBase,
  }),
});
export type RecordedDecision = z.infer<typeof RecordedDecisionSchema>;

export const RecordedDisruptionSchema = z.object({
  /** Number of agent turns completed when the disruption was injected. */
  afterDecisions: z.number().int().nonnegative(),
  body: DisruptionBody,
});
export type RecordedDisruption = z.infer<typeof RecordedDisruptionSchema>;

const ModelCallSchema = CallBase.extend({
  id: z.string().min(1),
  toolName: Tool.optional(),
  outcome: z.enum(["accepted", "rejected", "no_tool"]),
  reasonCode: z.string().optional(),
});

const EventSchema = z.object({
  seq: z.number().int().positive(),
  logicalTime: z.number(),
  stateVersion: z.number().int().nonnegative(),
  kind: z.enum(["engine", "message", "model_call", "disruption", "escalation"]),
  type: z.string(),
  actorId: z.string().optional(),
  affectedIds: z.array(z.string()),
  summary: z.string(),
  causationId: z.string().optional(),
  provenance: z.enum([
    "engine",
    "nemotron",
    "test_model",
    "fallback",
    "baseline",
    "operator",
    "external_search",
    "replay",
  ]),
  sources: z.array(z.object({ title: z.string(), url: z.url() })).optional(),
});

export const RecordedRunSchema = z.object({
  version: z.literal(1),
  scenarioId: z.literal("d108"),
  recordedAt: z.iso.datetime(),
  /** Distinct model ids of non-fallback turns; empty means no model answered. */
  models: z.array(z.string()),
  /** True only when at least one turn was genuinely answered by a model. */
  hasModelTurns: z.boolean(),
  decisions: z.array(RecordedDecisionSchema),
  disruptions: z.array(RecordedDisruptionSchema),
  finalStateVersion: z.number().int().nonnegative(),
  events: z.array(EventSchema),
  modelCalls: z.array(ModelCallSchema),
  /** Final engine checkpoint, for comparison; opaque to the schema. */
  finalEngine: z.record(z.string(), z.unknown()),
});
export type RecordedRun = z.infer<typeof RecordedRunSchema>;

/** True when any call was answered by the Claude test provider (never Nemotron). */
export const isTestRecording = (r: RecordedRun): boolean =>
  r.modelCalls.some((c) => !c.isFallback && c.provider === "anthropic") ||
  r.events.some((e) => e.provenance === "test_model");
