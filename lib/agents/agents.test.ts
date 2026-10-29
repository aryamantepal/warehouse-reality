import { describe, expect, it } from "vitest";
import { fallbackLocalDeliberation } from "./nebius-client";
import { buildDeliberationPrompt } from "./prompts";
import { AgentToolCallSchema } from "./schemas";

describe("Agent Tool Schemas (Zod Validation)", () => {
  it("validates a well-formed propose tool call", () => {
    const raw = {
      tool: "propose",
      parameters: {
        task: "Relocate trailer T-2291 to D-112",
        requiredResources: [
          {
            resourceId: "D-112",
            type: "dock",
            startWindow: 51600,
            endWindow: 54300,
          },
        ],
        expiresAt: 52000,
        participants: [{ agentId: "DRV-047", role: "driver", accepted: false }],
      },
    };

    const result = AgentToolCallSchema.safeParse(raw);
    expect(result.success).toBe(true);
  });

  it("validates accept and commit tool calls", () => {
    const acceptCall = {
      tool: "accept",
      parameters: {
        participantId: "DRV-047",
        commitmentId: "C-88",
        acceptedAtVersion: 12,
      },
    };
    expect(AgentToolCallSchema.safeParse(acceptCall).success).toBe(true);

    const commitCall = {
      tool: "commit",
      parameters: {
        commitmentId: "C-88",
        requestId: "REQ-001",
      },
    };
    expect(AgentToolCallSchema.safeParse(commitCall).success).toBe(true);
  });

  it("validates physical movement and unload tool calls", () => {
    const moveCall = {
      tool: "executeMove",
      parameters: {
        trailerId: "T-2291",
        targetLocation: { kind: "dock", dockId: "D-112" },
        tractorId: "YT-2",
      },
    };
    expect(AgentToolCallSchema.safeParse(moveCall).success).toBe(true);

    const unloadCall = {
      tool: "executeUnload",
      parameters: {
        trailerId: "T-2291",
        shipmentId: "SH-5512",
        quantity: 13,
      },
    };
    expect(AgentToolCallSchema.safeParse(unloadCall).success).toBe(true);
  });

  it("rejects invalid payloads with violations", () => {
    const invalidUnload = {
      tool: "executeUnload",
      parameters: {
        trailerId: "T-2291",
        shipmentId: "SH-5512",
        quantity: -5, // Negative quantity rejected
      },
    };
    expect(AgentToolCallSchema.safeParse(invalidUnload).success).toBe(false);

    const missingParams = {
      tool: "executeMove",
      parameters: {
        trailerId: "T-2291",
        // Missing targetLocation
      },
    };
    expect(AgentToolCallSchema.safeParse(missingParams).success).toBe(false);
  });
});

describe("Agent Prompts & Scoped Observation", () => {
  it("builds prompt with scoped driver view and invariants", () => {
    const prompt = buildDeliberationPrompt(
      "driver",
      "DRV-047",
      { trailerId: "T-2291", cargoCount: 22 },
      [{ id: "M-311", purpose: "offer" }],
      [],
      [],
      "Protect 15:30 departure",
    );

    expect(prompt).toContain("autonomous Freight Driver Agent");
    expect(prompt).toContain("NON-NEGOTIABLE OPERATIONAL INVARIANTS");
    expect(prompt).toContain("DRV-047");
    expect(prompt).toContain("Protect 15:30 departure");
    expect(prompt).toContain("M-311");
  });
});

describe("Deterministic Fallback Deliberation", () => {
  it("generates accept tool call for driver with inbox offer", () => {
    const result = fallbackLocalDeliberation(
      "driver",
      "DRV-047",
      { time: 50850, trailerId: "T-2291" },
      [{ id: "M-311", purpose: "offer", payload: { commitmentId: "C-88" } }],
      15,
    );

    expect(result.toolCall?.tool).toBe("accept");
    expect(result.toolCall?.parameters.commitmentId).toBe("C-88");
  });

  it("generates propose tool call for dock lead when door is closed", () => {
    const result = fallbackLocalDeliberation(
      "dock_lead",
      "DOCK-C",
      {
        time: 50850,
        docks: [
          { id: "D-108", status: "closed" },
          { id: "D-112", status: "free" },
        ],
      },
      [],
      15,
    );

    expect(result.toolCall?.tool).toBe("propose");
    expect(result.thought).toContain("D-108 is closed");
  });
});
