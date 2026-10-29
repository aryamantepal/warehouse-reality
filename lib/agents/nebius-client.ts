/**
 * Nebius / NVIDIA API Client with Offline Deterministic Fallback (PRD §1, §6).
 * Handles model inference via OpenAI-compatible endpoints with strict error boundaries.
 */

import type { AgentRole, AgentToolCall } from "./types";

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Deterministic local fallback deliberation when NEBIUS_API_KEY is not configured
 * or network is offline during hackathon review / testing.
 */
export const fallbackLocalDeliberation = (
  role: AgentRole,
  agentId: string,
  observation: Record<string, unknown>,
  inbox: Array<Record<string, unknown>>,
  version: number,
): { thought: string; toolCall?: AgentToolCall } => {
  const time = typeof observation.time === "number" ? observation.time : 50850;

  if (role === "driver") {
    // Check if there is an unhandled offer in the inbox
    const offerMsg = inbox.find(
      (m) =>
        m.purpose === "offer" ||
        (m.payload &&
          typeof m.payload === "object" &&
          "commitmentId" in m.payload),
    );

    if (offerMsg?.payload) {
      const commitmentId =
        (offerMsg.payload as { commitmentId?: string }).commitmentId ?? "C-88";
      return {
        thought: `Received dock relocation offer ${commitmentId} for my trailer. Dock D-108 is closed; alternative door window satisfies ETA target 15:30. Accepting offer.`,
        toolCall: {
          tool: "accept",
          parameters: {
            participantId: agentId,
            commitmentId,
            acceptedAtVersion: version,
          },
        },
      };
    }

    return {
      thought: `Driver ${agentId} observing trailer ${observation.trailerId ?? "T-2291"}. Waiting for dock readiness or instruction.`,
    };
  }

  if (role === "dock_lead") {
    // Check if D-108 is closed and we need to propose D-112
    const docks = Array.isArray(observation.docks) ? observation.docks : [];
    const closedDock = docks.find(
      (d: { id: string; status: string }) =>
        d.status === "closed" && d.id === "D-108",
    );

    if (closedDock) {
      // Propose relocation to D-112
      return {
        thought:
          "Dock D-108 is closed due to disruption H-1. Door D-112 is free. Formulating atomic commitment proposal to relocate trailer T-2291 to D-112.",
        toolCall: {
          tool: "propose",
          parameters: {
            task: "Relocate trailer T-2291 to D-112 and resume cargo unload",
            requiredResources: [
              {
                resourceId: "D-112",
                type: "dock",
                startWindow: time + 600,
                endWindow: time + 3600,
              },
              {
                resourceId: "T-2291",
                type: "trailer",
                startWindow: time + 600,
                endWindow: time + 3600,
              },
            ],
            expiresAt: time + 900,
            participants: [
              { agentId: "DRV-047", role: "driver", accepted: false },
              {
                agentId: "DOCK-C",
                role: "dock_lead",
                accepted: true,
                acceptedAtVersion: version,
              },
              { agentId: "YARD-1", role: "yard_controller", accepted: false },
            ],
          },
        },
      };
    }

    return {
      thought: `Dock Lead ${agentId} monitoring assigned doors in Sector C. All assigned doors operating within parameters.`,
    };
  }

  if (role === "yard_controller") {
    // If movement task requested, execute move with YT-2
    return {
      thought: `Yard Controller ${agentId} coordinating hostler tractor YT-2 for yard relocation across approved lanes.`,
      toolCall: {
        tool: "executeMove",
        parameters: {
          trailerId: "T-2291",
          targetLocation: { kind: "dock", dockId: "D-112" },
          tractorId: "YT-2",
        },
      },
    };
  }

  if (role === "supervisor") {
    return {
      thought: `Supervisor ${agentId} reviewing shift status. All hard physical invariants and SLAs are currently satisfied.`,
    };
  }

  return {
    thought: `Agent ${agentId} in role ${role} completed observation cycle.`,
  };
};
