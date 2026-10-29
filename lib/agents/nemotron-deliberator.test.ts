import { afterEach, describe, expect, it, vi } from "vitest";
import type { TurnInput } from "../../types/run";
import { BaselineDeliberator } from "../run/baseline-deliberator";
import { Run } from "../run/run";
import { createNemotronDeliberator } from "./nemotron-deliberator";
import type { AgentRole, AgentState } from "./types";

const KEY = "test-secret-key-do-not-leak";
const env = { NEBIUS_API_KEY: KEY } as unknown as NodeJS.ProcessEnv;

const agent = (role: AgentRole, id: string): AgentState => ({
  id,
  role,
  name: id,
  assignedEntityId: "T-2291",
  goals: [],
  obligations: [],
  inbox: [],
  outbox: [],
  memory: [],
  fallbackCounter: 0,
});

const turn = (
  role: AgentRole = "dock_lead",
  tier: TurnInput["tier"] = "super",
): TurnInput => ({
  agent: agent(role, "DOCK-C"),
  tier,
  observation: { time: 50850 },
  inbox: [],
  stateVersion: 3,
  logicalTime: 50850,
});

const reply = (content: string, usage?: Record<string, number>) =>
  Response.json({ choices: [{ message: { content } }], usage });

const mockFetch = (impl: (...args: unknown[]) => Promise<Response>) => {
  const fn = vi.fn(impl);
  vi.stubGlobal("fetch", fn);
  return fn;
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const escalate = {
  tool: "escalate",
  parameters: {
    reason: "deadlock",
    participants: ["DOCK-C"],
    unresolvedChoices: ["D-112"],
  },
};

describe("Nemotron deliberator", () => {
  it("captures usage tokens and the requested model id", async () => {
    const fetchMock = mockFetch(async () =>
      reply(JSON.stringify({ thought: "Escalating.", toolCall: escalate }), {
        prompt_tokens: 120,
        completion_tokens: 30,
      }),
    );
    const d = await createNemotronDeliberator({ env }).decide(
      turn("supervisor", "ultra"),
    );
    const sent = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(sent.model).toBe("nvidia/Nemotron-3-Ultra-550b-a55b");
    expect(d.call).toMatchObject({
      model: "nvidia/Nemotron-3-Ultra-550b-a55b",
      tier: "ultra",
      isFallback: false,
      promptTokens: 120,
      completionTokens: 30,
    });
    expect(d.call.latencyMs).toBeGreaterThanOrEqual(0);
    expect(d.call.fallbackReason).toBeUndefined();
    expect(d.toolCall?.tool).toBe("escalate");
  });

  it("reports unknown usage as null and honors tier model overrides", async () => {
    mockFetch(async () => reply('{"thought":"Watching."}'));
    const d = await createNemotronDeliberator({
      env: { ...env, NEBIUS_MODEL_NANO: "custom/nano" },
    }).decide(turn("driver", "nano"));
    expect(d.call.model).toBe("custom/nano");
    expect(d.call.promptTokens).toBeNull();
    expect(d.call.completionTokens).toBeNull();
    expect(d.toolCall).toBeUndefined();
  });

  it.each([
    ["text-only reply", "I think we should move the trailer."],
    ["malformed JSON", '{"thought": "x", "toolCall": {'],
    [
      "unknown tool",
      JSON.stringify({
        thought: "x",
        toolCall: { tool: "teleport", parameters: {} },
      }),
    ],
    [
      "invalid tool arguments",
      JSON.stringify({
        thought: "x",
        toolCall: { tool: "accept", parameters: { participantId: 5 } },
      }),
    ],
  ])("%s is a labeled fallback with no tool call", async (_n, content) => {
    mockFetch(async () =>
      reply(content, { prompt_tokens: 10, completion_tokens: 5 }),
    );
    const d = await createNemotronDeliberator({ env }).decide(turn());
    expect(d.toolCall).toBeUndefined();
    expect(d.call).toMatchObject({
      isFallback: true,
      fallbackReason: "malformed_tool_call",
      promptTokens: 10,
      completionTokens: 5,
    });
  });

  it("HTTP 429 is a labeled http_error fallback and never leaks the key", async () => {
    mockFetch(async () => new Response(`bad key ${KEY}`, { status: 429 }));
    const d = await createNemotronDeliberator({ env }).decide(turn());
    expect(d.call).toMatchObject({
      isFallback: true,
      fallbackReason: "http_error",
    });
    expect(JSON.stringify(d)).not.toContain(KEY);
  });

  it("a network error is an http_error fallback", async () => {
    mockFetch(async () => {
      throw new TypeError("fetch failed");
    });
    const d = await createNemotronDeliberator({ env }).decide(turn());
    expect(d.call.fallbackReason).toBe("http_error");
  });

  it("a request that outlives the timeout is a timeout fallback", async () => {
    mockFetch(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          (init as RequestInit).signal?.addEventListener("abort", () =>
            reject((init as RequestInit).signal?.reason),
          );
        }),
    );
    const d = await createNemotronDeliberator({ env, timeoutMs: 10 }).decide(
      turn(),
    );
    expect(d.call).toMatchObject({
      isFallback: true,
      fallbackReason: "timeout",
    });
  });

  it("a missing key falls back without calling the network", async () => {
    const fetchMock = mockFetch(async () => reply("{}"));
    const d = await createNemotronDeliberator({
      env: {} as unknown as NodeJS.ProcessEnv,
    }).decide(turn());
    expect(fetchMock).not.toHaveBeenCalled();
    expect(d.call).toMatchObject({
      isFallback: true,
      fallbackReason: "no_api_key",
    });
    expect(d.call.model).toBe("nvidia/nemotron-3-super-120b-a12b");
  });
});

describe("Nemotron deliberator inside a Run (Review Focus 1)", () => {
  it("text-only replies never become Nemotron actions and the run continues", async () => {
    mockFetch(async () => reply("Let me just describe what I would do."));
    const run = new Run({
      runId: "run-nemotron",
      mode: "live",
      deliberator: createNemotronDeliberator({ env }),
      fallbackDeliberator: new BaselineDeliberator(),
      tierFor: (role) =>
        role === "driver" ? "nano" : role === "supervisor" ? "ultra" : "super",
    });
    run.injectDisruption({ type: "dock_closure", targetId: "D-108" });
    const before = run.snapshot().engine;
    const { snapshot } = await run.step(8);

    expect(snapshot.modelCalls.length).toBeGreaterThan(0);
    for (const c of snapshot.modelCalls) {
      expect(c.isFallback).toBe(true);
      expect(c.fallbackReason).toBe("malformed_tool_call");
      expect(c.toolName).toBeUndefined();
      expect(c.outcome).toBe("no_tool");
    }
    const turns = snapshot.events.filter((e) => e.type === "agent_turn");
    expect(turns.length).toBeGreaterThan(0);
    expect(turns.every((e) => e.provenance === "fallback")).toBe(true);
    expect(snapshot.events.some((e) => e.provenance === "nemotron")).toBe(
      false,
    );
    expect(snapshot.engine).toEqual(before);
    expect(snapshot.status).not.toBe("error");
  });
});
