import { afterEach, describe, expect, it, vi } from "vitest";
import type { TurnInput } from "../../types/run";
import { callBadgeOf } from "../dashboard/call-badge";
import { RunSnapshotSchema } from "../dashboard/run-snapshot-schema";
import { BaselineDeliberator } from "../run/baseline-deliberator";
import { exportRun, parseRecording } from "../run/recording";
import { isTestRecording } from "../run/recording-schema";
import { Run } from "../run/run";
import { requestChatCompletion, selectProvider } from "./chat-completion";
import { createNemotronDeliberator } from "./nemotron-deliberator";
import type { AgentState } from "./types";

const KEY = "anthropic-secret-do-not-leak";
const asEnv = (o: Record<string, string>) => o as unknown as NodeJS.ProcessEnv;
const env = asEnv({ ANTHROPIC_API_KEY: KEY });

const escalate = {
  tool: "escalate",
  parameters: {
    reason: "deadlock",
    participants: ["DOCK-C"],
    unresolvedChoices: ["D-112"],
  },
};

const anthropicReply = (text: string) =>
  Response.json({
    content: [{ type: "text", text }],
    usage: { input_tokens: 111, output_tokens: 22 },
  });

const mockFetch = (impl: (...args: unknown[]) => Promise<Response>) => {
  const fn = vi.fn(impl);
  vi.stubGlobal("fetch", fn);
  return fn;
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const agent: AgentState = {
  id: "DOCK-C",
  role: "dock_lead",
  name: "DOCK-C",
  assignedEntityId: "T-2291",
  goals: [],
  obligations: [],
  inbox: [],
  outbox: [],
  memory: [],
  fallbackCounter: 0,
};
const turn: TurnInput = {
  agent,
  tier: "super",
  observation: { time: 50850 },
  inbox: [],
  stateVersion: 3,
  logicalTime: 50850,
};
const user = [{ role: "user" as const, content: "hi" }];

describe("provider selection", () => {
  it("prefers Nebius, then Anthropic, else Nebius (no key)", () => {
    expect(
      selectProvider(asEnv({ NEBIUS_API_KEY: "n", ANTHROPIC_API_KEY: "a" })),
    ).toBe("nebius");
    expect(selectProvider(asEnv({ ANTHROPIC_API_KEY: "a" }))).toBe("anthropic");
    expect(selectProvider(asEnv({}))).toBe("nebius");
  });
});

describe("Anthropic test provider", () => {
  it("sends the Messages API request shape and parses text and usage", async () => {
    const fetchMock = mockFetch(async () => anthropicReply("hello"));
    const r = await requestChatCompletion(
      [{ role: "system", content: "be brief" }, ...user],
      "claude-haiku-5-5",
      { env },
    );
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(init.headers).toEqual({
      "x-api-key": KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    });
    expect(JSON.parse(init.body as string)).toEqual({
      model: "claude-haiku-5-5",
      max_tokens: 1024,
      temperature: 0.1,
      system: "be brief",
      messages: user,
    });
    expect(r).toMatchObject({
      ok: true,
      content: "hello",
      provider: "anthropic",
      promptTokens: 111,
      completionTokens: 22,
    });
  });

  it("retries once without temperature when the model rejects it", async () => {
    const fetchMock = mockFetch(async (_u, init) =>
      JSON.parse(((init as RequestInit).body as string) ?? "{}").temperature
        ? new Response('{"error":{"message":"temperature is deprecated"}}', {
            status: 400,
          })
        : anthropicReply("ok"),
    );
    const r = await requestChatCompletion(user, "m", { env });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(r).toMatchObject({ ok: true, content: "ok" });
  });

  it("reports missing usage as null, never 0", async () => {
    mockFetch(async () =>
      Response.json({ content: [{ type: "text", text: "x" }] }),
    );
    const r = await requestChatCompletion(user, "m", { env });
    expect(r).toMatchObject({
      ok: true,
      promptTokens: null,
      completionTokens: null,
    });
  });

  it("maps an HTTP error without leaking the key", async () => {
    mockFetch(async () => new Response(`bad ${KEY}`, { status: 500 }));
    const r = await requestChatCompletion(user, "m", { env });
    expect(r).toMatchObject({
      ok: false,
      reason: "http_error",
      provider: "anthropic",
    });
    expect(JSON.stringify(r)).not.toContain(KEY);
  });

  it("maps a timeout", async () => {
    mockFetch(
      (_u, init) =>
        new Promise((_res, rej) => {
          const signal = (init as RequestInit).signal;
          signal?.addEventListener("abort", () => rej(signal.reason));
        }),
    );
    const r = await requestChatCompletion(user, "m", { env, timeoutMs: 10 });
    expect(r).toMatchObject({ ok: false, reason: "timeout" });
  });

  it("uses ANTHROPIC_TEST_MODEL, defaulting to claude-haiku-5-5", async () => {
    const fetchMock = mockFetch(async () =>
      anthropicReply(
        JSON.stringify({ thought: "Escalating.", toolCall: escalate }),
      ),
    );
    const d = await createNemotronDeliberator({ env }).decide(turn);
    expect(d.call.model).toBe("claude-haiku-5-5");
    await createNemotronDeliberator({
      env: asEnv({ ANTHROPIC_API_KEY: KEY, ANTHROPIC_TEST_MODEL: "claude-x" }),
    }).decide(turn);
    const sent = JSON.parse(
      (fetchMock.mock.calls[1][1] as RequestInit).body as string,
    );
    expect(sent.model).toBe("claude-x");
  });

  it("extracts JSON wrapped in prose but still rejects invalid tool calls", async () => {
    mockFetch(async () =>
      anthropicReply(
        `Sure! Here: ${JSON.stringify({ thought: "ok", toolCall: escalate })} done.`,
      ),
    );
    const good = await createNemotronDeliberator({ env }).decide(turn);
    expect(good.call.isFallback).toBe(false);
    mockFetch(async () =>
      anthropicReply(
        '{"thought":"x","toolCall":{"tool":"bogus","parameters":{}}}',
      ),
    );
    const bad = await createNemotronDeliberator({ env }).decide(turn);
    expect(bad.call).toMatchObject({
      isFallback: true,
      fallbackReason: "malformed_tool_call",
    });
  });
});

describe("test_model provenance", () => {
  const liveRun = async () => {
    mockFetch(async () =>
      anthropicReply(
        JSON.stringify({ thought: "Escalating.", toolCall: escalate }),
      ),
    );
    const run = new Run({
      runId: "run-claude",
      mode: "live",
      deliberator: createNemotronDeliberator({ env }),
      fallbackDeliberator: new BaselineDeliberator(),
      tierFor: (role) =>
        role === "driver" ? "nano" : role === "supervisor" ? "ultra" : "super",
    });
    run.injectDisruption({ type: "dock_closure", targetId: "D-108" });
    await run.step(4);
    return run;
  };

  it("labels Claude turns test_model, never nemotron, and round-trips the schemas", async () => {
    const run = await liveRun();
    const snap = run.snapshot();
    const answered = snap.modelCalls.filter((c) => !c.isFallback);
    expect(answered.length).toBeGreaterThan(0);
    expect(answered.every((c) => c.provider === "anthropic")).toBe(true);
    const turns = snap.events.filter((e) => e.type === "agent_turn");
    expect(turns.some((e) => e.provenance === "test_model")).toBe(true);
    expect(snap.events.some((e) => e.provenance === "nemotron")).toBe(false);
    expect(
      RunSnapshotSchema.safeParse(JSON.parse(JSON.stringify(snap))).success,
    ).toBe(true);
    const rec = parseRecording(JSON.parse(JSON.stringify(exportRun(run))));
    expect(isTestRecording(rec)).toBe(true);
  });

  it("badge reads CLAUDE (TEST), not nemotron", async () => {
    const run = await liveRun();
    const c = run.snapshot().modelCalls.find((m) => !m.isFallback);
    expect(c).toBeDefined();
    if (!c) return;
    expect(callBadgeOf(c, "test_model")).toMatchObject({
      source: "test_model",
      label: "CLAUDE (TEST)",
    });
    expect(callBadgeOf(c, "replay").label).toBe("CLAUDE (TEST)");
  });
});
