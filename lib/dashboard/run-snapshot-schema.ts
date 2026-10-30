/**
 * Zod schema for a RunSnapshot read from outside this process: /api/runs/**
 * responses and recorded replay files. The `Same` checks at the bottom fail
 * typecheck when the schema and types/run.ts drift either way, including a
 * widened union in the contract that the schema would still reject.
 */

import { z } from "zod";
import { PhysicalLocationSchema } from "@/lib/agents/schemas";
import { RunSourceSchema } from "@/lib/run/api-schemas";
import type { RunSnapshot, StepResult } from "@/types/run";

const id = z.string().min(1);
const num = z.number();
const record = z.record(z.string(), z.unknown());
const entry = <T extends z.ZodType>(value: T) => z.tuple([id, value]);

const ReservationSchema = z.object({
  resourceId: id,
  type: z.enum(["dock", "stall", "equipment", "worker", "trailer", "tractor"]),
  startWindow: num,
  endWindow: num,
});

const CommitmentSchema = z.object({
  id,
  task: z.string(),
  status: z.enum([
    "proposed",
    "partially_accepted",
    "ready_for_validation",
    "committed",
    "executing",
    "completed",
    "cancelled",
    "rejected",
    "expired",
  ]),
  participants: z.array(
    z.object({
      agentId: id,
      role: z.string(),
      accepted: z.boolean(),
      acceptedAtVersion: num.optional(),
    }),
  ),
  requiredResources: z.array(ReservationSchema),
  createdAt: num,
  expiresAt: num,
  committedAt: num.optional(),
  completedAt: num.optional(),
  stateVersion: num,
  rejectionReason: z.string().optional(),
});

const EngineEventSchema = z.object({
  id,
  logicalTime: num,
  sequence: num,
  type: z.string(),
  affectedIds: z.array(z.string()),
  payload: record.optional(),
  causationId: z.string().optional(),
  stateVersion: num,
});

const ToolResultSchema = z.object({
  success: z.boolean(),
  reasonCode: z
    .enum([
      "STALE_VERSION",
      "RESOURCE_UNAVAILABLE",
      "INVARIANT_VIOLATION",
      "OFFER_EXPIRED",
      "DUPLICATE_REQUEST",
      "PARTICIPANTS_INCOMPLETE",
      "NOT_FOUND",
      "PERMISSION_DENIED",
    ])
    .optional(),
  message: z.string().optional(),
  affectedIds: z.array(z.string()),
  stateVersion: num,
  eventIds: z.array(z.string()),
});

const EngineSnapshotSchema = z.object({
  logicalTime: num,
  stateVersion: num,
  eventCount: num,
  state: z.object({
    docks: z.array(
      entry(
        z.object({
          id,
          kind: z.enum(["dock", "ramp"]),
          status: z.enum(["free", "occupied", "closed", "reserved"]),
          occupiedTrailerId: z.string().optional(),
          reservedCommitmentId: z.string().optional(),
        }),
      ),
    ),
    stalls: z.array(
      entry(
        z.object({
          id,
          occupiedTrailerId: z.string().optional(),
          reservedCommitmentId: z.string().optional(),
        }),
      ),
    ),
    trailers: z.array(
      entry(
        z.object({
          id,
          location: PhysicalLocationSchema,
          cargo: z.array(z.object({ shipmentId: id, quantity: num })),
          doorOpen: z.boolean(),
          status: z.enum([
            "parked",
            "serving",
            "waiting",
            "moving",
            "blocked",
            "gate",
          ]),
          assignedCommitmentId: z.string().optional(),
        }),
      ),
    ),
    tractors: z.array(
      entry(
        z.object({
          id,
          role: z.enum(["road", "yard"]),
          coupledTrailerId: z.string().optional(),
          status: z.enum(["idle", "moving", "servicing"]),
          currentTask: z.string().optional(),
          assignedCommitmentId: z.string().optional(),
        }),
      ),
    ),
    equipment: z.array(
      entry(
        z.object({
          id,
          type: z.enum(["forklift", "yard_tractor"]),
          status: z.enum(["working", "failed", "idle"]),
          assignedCommitmentId: z.string().optional(),
        }),
      ),
    ),
    workers: z.array(
      entry(
        z.object({
          id,
          role: z.enum(["crew", "maintenance"]),
          status: z.enum(["available", "assigned", "absent"]),
          assignedCommitmentId: z.string().optional(),
        }),
      ),
    ),
    shipments: z.array(
      entry(
        z.object({
          id,
          origin: z.string(),
          destination: z.string(),
          totalQuantity: num,
          transferredQuantity: num,
          containerId: id,
        }),
      ),
    ),
    commitments: z.array(entry(CommitmentSchema)),
  }),
  queue: z.array(EngineEventSchema),
  processed: z.array(z.tuple([z.string(), ToolResultSchema])),
  sequence: num,
});

const RoleSchema = z.enum([
  "driver",
  "dock_lead",
  "yard_controller",
  "supervisor",
]);

const MessageSchema = z.object({
  id,
  fromAgentId: id,
  toAgentId: id,
  purpose: z.enum([
    "request",
    "offer",
    "accept",
    "decline",
    "cancel",
    "escalate",
    "status_update",
  ]),
  payload: record,
  sentAt: num,
  deliveryTime: num.optional(),
  causationId: z.string().optional(),
});

const AgentStateSchema = z.object({
  id,
  role: RoleSchema,
  name: z.string(),
  assignedEntityId: z.string(),
  goals: z.array(
    z.object({
      id,
      description: z.string(),
      priority: z.enum(["critical", "high", "normal", "low"]),
      targetTime: num.optional(),
    }),
  ),
  obligations: z.array(
    z.object({
      commitmentId: id,
      role: z.string(),
      task: z.string(),
      status: z.enum(["pending", "fulfilled", "cancelled", "breached"]),
      deadline: num,
    }),
  ),
  inbox: z.array(MessageSchema),
  outbox: z.array(MessageSchema),
  memory: z.array(
    z.object({
      id,
      timestamp: num,
      type: z.enum([
        "observation",
        "message_received",
        "message_sent",
        "tool_call",
        "escalation",
      ]),
      summary: z.string(),
      details: record.optional(),
    }),
  ),
  fallbackCounter: num,
});

const ProvenanceSchema = z.enum([
  "engine",
  "nemotron",
  "test_model",
  "fallback",
  "baseline",
  "operator",
  "external_search",
  "replay",
]);

const RunEventSchema = z.object({
  seq: num,
  logicalTime: num,
  stateVersion: num,
  kind: z.enum(["engine", "message", "model_call", "disruption", "escalation"]),
  type: z.string(),
  actorId: z.string().optional(),
  affectedIds: z.array(z.string()),
  summary: z.string(),
  causationId: z.string().optional(),
  provenance: ProvenanceSchema,
  sources: z.array(RunSourceSchema).optional(),
});

// Token counts may be null (provider did not report); never coerced to 0.
const tokens = z.number().int().nonnegative().nullable();

const ModelCallSchema = z.object({
  id,
  agentId: id,
  role: RoleSchema,
  tier: z.enum(["nano", "super", "ultra"]),
  model: z.string().min(1),
  provider: z.enum(["nebius", "anthropic"]).optional(),
  isFallback: z.boolean(),
  fallbackReason: z
    .enum([
      "no_api_key",
      "http_error",
      "timeout",
      "malformed_tool_call",
      "budget_exhausted",
    ])
    .optional(),
  latencyMs: z.number().nonnegative(),
  promptTokens: tokens,
  completionTokens: tokens,
  logicalTime: num,
  stateVersion: num,
  toolName: z
    .enum([
      "propose",
      "accept",
      "commit",
      "executeMove",
      "executeUnload",
      "injectDisruption",
      "cancel",
      "escalate",
      "observe",
    ])
    .optional(),
  outcome: z.enum(["accepted", "rejected", "no_tool"]),
  reasonCode: z.string().optional(),
});

export const RunSnapshotSchema = z.object({
  runId: id,
  mode: z.enum(["live", "baseline", "replay"]),
  scenarioId: z.literal("d108"),
  status: z.enum(["idle", "deliberating", "done", "error"]),
  logicalTime: num,
  stateVersion: num,
  engine: EngineSnapshotSchema,
  agents: z.array(AgentStateSchema),
  events: z.array(RunEventSchema),
  modelCalls: z.array(ModelCallSchema),
  budget: z.object({
    calls: z.number().int().nonnegative(),
    tokens: z.number().int().nonnegative(),
    capCalls: z.literal(60),
    capTokens: z.literal(150000),
    exhausted: z.boolean(),
  }),
});

export const StepResultSchema = z.object({
  snapshot: RunSnapshotSchema,
  newEvents: z.array(RunEventSchema),
});

/** True only when A and B are mutually assignable. */
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

true satisfies Same<z.infer<typeof RunSnapshotSchema>, RunSnapshot>;
true satisfies Same<z.infer<typeof StepResultSchema>, StepResult>;
