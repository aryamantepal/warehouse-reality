import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TurnInput } from "../../types/run";
import { selectProvider } from "./anthropic-client";
import { createNemotronDeliberator } from "./nemotron-deliberator";
import type { AgentState } from "./types";

// Synthetic test fixture: IDs follow the D-108 scenario, values are made up.
const DRIVER: AgentState = {
  id: "DRV-047",
  role: "driver",
  name: "Driver DRV-047",
  assignedEntityId: "T-2291",
  goals: [],
  obligations: [],
  inbox: [],
  outbox: [],
  memory: [],
  fallbackCounter: 0,
};

const input: TurnInput = {
  agent: DRIVER,
  tier: "nano",
  observation: { time: 100, version: 7, role: "driver" },
  inbox: [],
  stateVersion: 7,
  logicalTime: 100,
};

const ANTHROPIC_KEY = "anthropic-test-key-123";

const messageReply = (content: unknown[]) =>
  Response.json({
    stop_reason: "tool_use",
    content,
    usage: { input_tokens: 700, output_tokens: 40 },
  });

type FetchFn = (url: string, init: RequestInit) => Promise<Response>;

const stubFetch = (response: Response) => {
  const mock = vi.fn<FetchFn>(() => Promise.resolve(response));
  vi.stubGlobal("fetch", mock);
  return mock;
};

describe("Claude test provider", () => {
  beforeEach(() => {
    vi.stubEnv("NEBIUS_API_KEY", "");
    vi.stubEnv("ANTHROPIC_API_KEY", ANTHROPIC_KEY);
    vi.stubEnv("ANTHROPIC_TEST_MODEL", "");
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("selects Nebius whenever its key is set, Anthropic only without it", () => {
    expect(
      selectProvider({ NEBIUS_API_KEY: "n", ANTHROPIC_API_KEY: "a" }),
    ).toBe("nebius");
    expect(selectProvider({ ANTHROPIC_API_KEY: "a" })).toBe("anthropic");
    expect(selectProvider({})).toBe("nebius");
  });

  it("sends the documented request with no temperature and reads tool_use and usage", async () => {
    const fetchMock = stubFetch(
      messageReply([
        { type: "text", text: "Accepting the relocation." },
        {
          type: "tool_use",
          id: "tu-1",
          name: "wait",
          input: { reason: "Nothing for me to do yet." },
        },
      ]),
    );

    const decision = await createNemotronDeliberator().decide(input);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(init.headers).toMatchObject({
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
    });
    const body = JSON.parse(String(init.body));
    expect(body.model).toBe("claude-haiku-5-5");
    expect(body).not.toHaveProperty("temperature");
    expect(typeof body.system).toBe("string");
    expect(
      body.messages.every((m: { role: string }) => m.role !== "system"),
    ).toBe(true);
    expect(body.tools.length).toBeGreaterThan(0);
    expect(body.tools[0]).toHaveProperty("input_schema");
    expect(decision.call).toMatchObject({
      provider: "anthropic",
      model: "claude-haiku-5-5",
      isFallback: false,
      promptTokens: 700,
      completionTokens: 40,
    });
  });

  it("honours ANTHROPIC_TEST_MODEL", async () => {
    vi.stubEnv("ANTHROPIC_TEST_MODEL", "claude-test-x");
    const fetchMock = stubFetch(
      messageReply([
        { type: "tool_use", id: "tu-1", name: "wait", input: { reason: "x" } },
      ]),
    );
    const decision = await createNemotronDeliberator().decide(input);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body)).model).toBe(
      "claude-test-x",
    );
    expect(decision.call.model).toBe("claude-test-x");
  });

  it("validates tool_use input with the existing schemas", async () => {
    stubFetch(
      messageReply([
        {
          type: "tool_use",
          id: "tu-1",
          name: "accept",
          input: { commitmentId: 5 },
        },
      ]),
    );
    const decision = await createNemotronDeliberator().decide(input);
    expect(decision.toolCall).toBeUndefined();
    expect(decision.call).toMatchObject({
      isFallback: true,
      fallbackReason: "malformed_tool_call",
      provider: "anthropic",
    });
  });

  it("falls back, labeled and without a provider, on an HTTP error, redacting the key", async () => {
    stubFetch(new Response(`bad key ${ANTHROPIC_KEY}`, { status: 401 }));
    const decision = await createNemotronDeliberator().decide(input);
    expect(decision.call).toMatchObject({
      isFallback: true,
      fallbackReason: "http_error",
      model: "deterministic-local-fallback",
    });
    expect(decision.call.provider).toBeUndefined();
    const logged = vi.mocked(console.warn).mock.calls.flat().join(" ");
    expect(logged).not.toContain(ANTHROPIC_KEY);
  });

  it("uses Nebius unchanged when its key is set", async () => {
    vi.stubEnv("NEBIUS_API_KEY", "nebius-test-key");
    const fetchMock = stubFetch(
      Response.json({
        choices: [
          {
            finish_reason: "tool_calls",
            message: {
              tool_calls: [
                {
                  function: {
                    name: "wait",
                    arguments: JSON.stringify({ reason: "x" }),
                  },
                },
              ],
            },
          },
        ],
      }),
    );
    const decision = await createNemotronDeliberator().decide(input);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/chat/completions");
    expect(decision.call.provider).toBe("nebius");
  });
});
