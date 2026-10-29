/**
 * Agent Runtime Type Definitions (PRD §8, §9, §10).
 * Pure TypeScript; no rendering dependencies.
 */

import type { EntityId, ToolResult } from "../engine/types";

export type AgentRole =
  | "driver"
  | "dock_lead"
  | "yard_controller"
  | "supervisor";

export interface AgentGoal {
  id: string;
  description: string;
  priority: "critical" | "high" | "normal" | "low";
  targetTime?: number;
}

export interface AgentObligation {
  commitmentId: EntityId;
  role: string;
  task: string;
  status: "pending" | "fulfilled" | "cancelled" | "breached";
  deadline: number;
}

export interface AgentMemoryItem {
  id: string;
  timestamp: number;
  type:
    | "observation"
    | "message_received"
    | "message_sent"
    | "tool_call"
    | "escalation";
  summary: string;
  details?: Record<string, unknown>;
}

export interface AgentMessage {
  id: string;
  fromAgentId: EntityId;
  toAgentId: EntityId;
  purpose:
    | "request"
    | "offer"
    | "accept"
    | "decline"
    | "cancel"
    | "escalate"
    | "status_update";
  payload: Record<string, unknown>;
  sentAt: number;
  deliveryTime?: number;
  causationId?: string;
}

export interface AgentState {
  id: EntityId;
  role: AgentRole;
  name: string;
  assignedEntityId: EntityId; // e.g. "T-2291" for Driver, "DOCK-C" for Dock Lead
  goals: AgentGoal[];
  obligations: AgentObligation[];
  inbox: AgentMessage[];
  outbox: AgentMessage[];
  memory: AgentMemoryItem[];
  fallbackCounter: number;
}

export interface AgentObservation {
  logicalTime: number;
  stateVersion: number;
  role: AgentRole;
  data: Record<string, unknown>;
}

export interface AgentToolCall {
  tool:
    | "propose"
    | "accept"
    | "commit"
    | "executeMove"
    | "executeUnload"
    | "injectDisruption"
    | "cancel"
    | "escalate"
    | "observe";
  parameters: Record<string, unknown>;
}
