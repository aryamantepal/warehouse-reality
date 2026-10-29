/**
 * Agent registry and message passing for a run. Deliberation lives in
 * nemotron-deliberator.ts; the engine in lib/run owns every mutation.
 */

import type { EntityId } from "../engine/types";
import type { AgentMessage, AgentState } from "./types";

export class AgentRunner {
  private agents = new Map<EntityId, AgentState>();
  private messageCounter = 0;

  constructor() {
    this.registerDefaultAgents();
  }

  private registerDefaultAgents(): void {
    // 1. Driver DRV-047 (Trailer T-2291)
    this.registerAgent({
      id: "DRV-047",
      role: "driver",
      name: "Driver DRV-047",
      assignedEntityId: "T-2291",
      goals: [
        {
          id: "G-1",
          description: "Deliver inbound 22 pallets by 15:30",
          priority: "high",
          targetTime: 55800,
        },
      ],
      obligations: [],
      inbox: [
        {
          id: "M-311",
          fromAgentId: "DOCK-C",
          toAgentId: "DRV-047",
          purpose: "offer",
          payload: {
            commitmentId: "C-88",
            doorId: "D-112",
            window: "14:20-15:05",
          },
          sentAt: 50560,
        },
      ],
      outbox: [],
      memory: [
        {
          id: "MEM-1",
          timestamp: 50400,
          type: "observation",
          summary: "Arrived at D-108; started unload.",
        },
        {
          id: "MEM-2",
          timestamp: 50520,
          type: "observation",
          summary: "D-108 closed due to disruption H-1.",
        },
      ],
      fallbackCounter: 0,
    });

    // 2. Dock Lead DOCK-C (Sector C)
    this.registerAgent({
      id: "DOCK-C",
      role: "dock_lead",
      name: "Dock Lead C",
      assignedEntityId: "D-108",
      goals: [
        {
          id: "G-2",
          description:
            "Maximize dock door throughput and clear delayed trailers",
          priority: "high",
        },
      ],
      obligations: [],
      inbox: [],
      outbox: [],
      memory: [],
      fallbackCounter: 0,
    });

    // 3. Yard Controller YARD-1
    this.registerAgent({
      id: "YARD-1",
      role: "yard_controller",
      name: "Yard Controller 1",
      assignedEntityId: "YT-2",
      goals: [
        {
          id: "G-3",
          description:
            "Prevent yard congestion and execute authorized moves safely",
          priority: "normal",
        },
      ],
      obligations: [],
      inbox: [],
      outbox: [],
      memory: [],
      fallbackCounter: 0,
    });

    // 4. Supervisor SUP-1
    this.registerAgent({
      id: "SUP-1",
      role: "supervisor",
      name: "Operations Supervisor",
      assignedEntityId: "FACILITY",
      goals: [
        {
          id: "G-4",
          description: "Maintain shift SLA compliance and resolve escalations",
          priority: "critical",
        },
      ],
      obligations: [],
      inbox: [],
      outbox: [],
      memory: [],
      fallbackCounter: 0,
    });
  }

  public registerAgent(agent: AgentState): void {
    this.agents.set(agent.id, agent);
  }

  public getAgent(agentId: EntityId): AgentState | undefined {
    return this.agents.get(agentId);
  }

  public getAllAgents(): AgentState[] {
    return Array.from(this.agents.values());
  }

  public sendMessage(
    fromAgentId: EntityId,
    toAgentId: EntityId,
    purpose: AgentMessage["purpose"],
    payload: Record<string, unknown>,
    logicalTime: number,
  ): AgentMessage {
    this.messageCounter += 1;
    const msg: AgentMessage = {
      id: `M-${this.messageCounter}`,
      fromAgentId,
      toAgentId,
      purpose,
      payload,
      sentAt: logicalTime,
    };

    const sender = this.agents.get(fromAgentId);
    if (sender) {
      sender.outbox.push(msg);
      sender.memory.push({
        id: `MEM-MSG-${msg.id}`,
        timestamp: logicalTime,
        type: "message_sent",
        summary: `Sent ${purpose} to ${toAgentId}`,
        details: payload,
      });
    }

    const recipient = this.agents.get(toAgentId);
    if (recipient) {
      recipient.inbox.push(msg);
      recipient.memory.push({
        id: `MEM-RECV-${msg.id}`,
        timestamp: logicalTime,
        type: "message_received",
        summary: `Received ${purpose} from ${fromAgentId}`,
        details: payload,
      });
    }

    return msg;
  }
}
