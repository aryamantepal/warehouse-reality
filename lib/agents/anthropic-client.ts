/**
 * TEST-ONLY Claude provider for agent turns (never Nemotron). Used only when
 * NEBIUS_API_KEY is unset and ANTHROPIC_API_KEY is set. Same contract as
 * `requestToolCall`: never throws, returns the shared ToolCallResponse shape.
 * Server-only: it reads ANTHROPIC_API_KEY.
 */

import { z } from "zod";
import type { ModelProvider } from "../../types/run";
import type { ToolCallResponse } from "./nebius-client";
import type { ChatTool } from "./tool-definitions";

export const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
export const ANTHROPIC_VERSION = "2023-06-01";
export const ANTHROPIC_TEST_DEFAULT_MODEL = "claude-haiku-5-5";

const ERROR_DETAIL_CHARS = 200;

/** Nebius wins when its key is set; otherwise an Anthropic key selects Claude. */
export const selectProvider = (
  env: Record<string, string | undefined> = process.env,
): ModelProvider =>
  !env.NEBIUS_API_KEY?.trim() && env.ANTHROPIC_API_KEY?.trim()
    ? "anthropic"
    : "nebius";

export const anthropicTestModel = (
  env: NodeJS.ProcessEnv = process.env,
): string => env.ANTHROPIC_TEST_MODEL?.trim() || ANTHROPIC_TEST_DEFAULT_MODEL;

const TokenCount = z.number().int().nonnegative().nullable().catch(null);

const MessageBody = z.object({
  stop_reason: z.string().nullish(),
  content: z.array(z.unknown()).catch([]),
  usage: z
    .object({ input_tokens: TokenCount, output_tokens: TokenCount })
    .nullable()
    .catch(null),
});

const TextBlock = z.object({ type: z.literal("text"), text: z.string() });
const ToolUseBlock = z.object({
  type: z.literal("tool_use"),
  name: z.string(),
  input: z.unknown(),
});

export interface AnthropicToolCallRequest {
  apiKey: string;
  model: string;
  messages: ReadonlyArray<{ role: "system" | "user"; content: string }>;
  tools: readonly ChatTool[];
  timeoutMs: number;
  maxTokens: number;
}

const toAnthropicTools = (tools: readonly ChatTool[]) =>
  tools.map(({ function: fn }) => ({
    name: fn.name,
    description: fn.description,
    input_schema: fn.parameters,
  }));

/** One Messages API call with tools. No `temperature`: this model rejects it. */
export const requestAnthropicToolCall = async ({
  apiKey,
  model,
  messages,
  tools,
  timeoutMs,
  maxTokens,
}: AnthropicToolCallRequest): Promise<ToolCallResponse> => {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const fail = (
    reason: "http_error" | "timeout",
    detail: string,
  ): ToolCallResponse => ({
    ok: false,
    reason,
    detail: detail
      .replaceAll(apiKey, "[redacted]")
      .slice(0, ERROR_DETAIL_CHARS),
    latencyMs: Date.now() - started,
  });
  const system = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
  try {
    const response = await fetch(ANTHROPIC_MESSAGES_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        ...(system ? { system } : {}),
        messages: messages.filter((m) => m.role !== "system"),
        tools: toAnthropicTools(tools),
        tool_choice: { type: "any" },
      }),
    });
    if (!response.ok) {
      return fail(
        "http_error",
        `HTTP ${response.status} ${await response.text()}`,
      );
    }
    const parsed = MessageBody.safeParse(await response.json());
    if (!parsed.success) return fail("http_error", "unexpected response shape");
    const blocks = parsed.data.content;
    const text = blocks
      .map((b) => TextBlock.safeParse(b))
      .flatMap((r) => (r.success ? [r.data.text] : []))
      .join("");
    const firstUse = blocks.find(
      (b) => (b as { type?: unknown } | null)?.type === "tool_use",
    );
    const use =
      firstUse === undefined ? undefined : ToolUseBlock.safeParse(firstUse);
    return {
      ok: true,
      latencyMs: Date.now() - started,
      promptTokens: parsed.data.usage?.input_tokens ?? null,
      completionTokens: parsed.data.usage?.output_tokens ?? null,
      finishReason: parsed.data.stop_reason ?? null,
      content: text || null,
      reasoning: null,
      toolCall: use?.success
        ? {
            name: use.data.name,
            arguments: JSON.stringify(use.data.input ?? {}),
          }
        : null,
      unreadable:
        use && !use.success ? "tool_use block has no readable name" : null,
    };
  } catch (err) {
    return controller.signal.aborted
      ? fail("timeout", `no response within ${timeoutMs} ms`)
      : fail("http_error", err instanceof Error ? err.message : String(err));
  } finally {
    clearTimeout(timer);
  }
};
