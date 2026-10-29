/**
 * One Token Factory chat completion for an explicit model (plan Task B2).
 * Never throws and never echoes the key. Token usage is null when the provider
 * does not report it. Server-side only.
 */

import type { ModelProvider } from "../../types/run";
import { NEBIUS_DEFAULT_BASE_URL } from "./models";
import type { LLMMessage } from "./nebius-client";

export const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
export const ANTHROPIC_VERSION = "2023-06-01";

/**
 * Nebius wins when its key is set. Otherwise the Anthropic key selects the
 * TEST-ONLY Claude provider. Server-side only.
 */
export const selectProvider = (
  env: NodeJS.ProcessEnv = process.env,
): ModelProvider =>
  !env.NEBIUS_API_KEY?.trim() && env.ANTHROPIC_API_KEY?.trim()
    ? "anthropic"
    : "nebius";

export const TOKEN_FACTORY_TIMEOUT_MS = 20_000;

export type ChatCompletionResult =
  | {
      ok: true;
      content: string;
      provider: ModelProvider;
      promptTokens: number | null;
      completionTokens: number | null;
      latencyMs: number;
    }
  | {
      ok: false;
      reason: "no_api_key" | "http_error" | "timeout" | "malformed_tool_call";
      provider: ModelProvider;
      latencyMs: number;
    };

const isTimeout = (err: unknown): boolean =>
  err instanceof Error &&
  (err.name === "TimeoutError" || err.name === "AbortError");

const tokenCount = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

interface CompletionBody {
  choices?: Array<{ message?: { content?: unknown } }>;
  usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
}

interface AnthropicBody {
  content?: Array<{ type?: unknown; text?: unknown }>;
  usage?: { input_tokens?: unknown; output_tokens?: unknown };
}

const requestAnthropic = async (
  messages: LLMMessage[],
  model: string,
  apiKey: string,
  timeoutMs: number,
  elapsed: () => number,
): Promise<ChatCompletionResult> => {
  const provider = "anthropic" as const;
  const system = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
  const rest = messages.filter((m) => m.role !== "system");
  try {
    const send = (withTemperature: boolean) =>
      fetch(ANTHROPIC_MESSAGES_URL, {
        method: "POST",
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model,
          max_tokens: 1024,
          ...(withTemperature ? { temperature: 0.1 } : {}),
          ...(system ? { system } : {}),
          messages: rest,
        }),
      });
    let response = await send(true);
    if (response.status === 400) {
      // Newer Claude models reject temperature; retry once without it.
      const detail = await response.text().catch(() => "");
      if (/temperature/i.test(detail)) response = await send(false);
    }
    if (!response.ok) {
      return {
        ok: false,
        reason: "http_error",
        provider,
        latencyMs: elapsed(),
      };
    }
    const body = ((await response.json()) ?? {}) as AnthropicBody;
    const text = (body.content ?? [])
      .filter((b) => b.type === "text" && typeof b.text === "string")
      .map((b) => b.text as string)
      .join("");
    if (!text) {
      return {
        ok: false,
        reason: "malformed_tool_call",
        provider,
        latencyMs: elapsed(),
      };
    }
    return {
      ok: true,
      content: text,
      provider,
      promptTokens: tokenCount(body.usage?.input_tokens),
      completionTokens: tokenCount(body.usage?.output_tokens),
      latencyMs: elapsed(),
    };
  } catch (err) {
    return {
      ok: false,
      reason: isTimeout(err) ? "timeout" : "http_error",
      provider,
      latencyMs: elapsed(),
    };
  }
};

export const requestChatCompletion = async (
  messages: LLMMessage[],
  model: string,
  opts: { timeoutMs?: number; env?: NodeJS.ProcessEnv } = {},
): Promise<ChatCompletionResult> => {
  const env = opts.env ?? process.env;
  const started = Date.now();
  const elapsed = () => Date.now() - started;
  const timeoutMs = opts.timeoutMs ?? TOKEN_FACTORY_TIMEOUT_MS;
  const apiKey = env.NEBIUS_API_KEY?.trim();
  if (selectProvider(env) === "anthropic") {
    return requestAnthropic(
      messages,
      model,
      env.ANTHROPIC_API_KEY?.trim() ?? "",
      timeoutMs,
      elapsed,
    );
  }
  if (!apiKey) {
    return {
      ok: false,
      reason: "no_api_key",
      provider: "nebius",
      latencyMs: elapsed(),
    };
  }
  const baseUrl = (
    env.NEBIUS_BASE_URL?.trim() || NEBIUS_DEFAULT_BASE_URL
  ).replace(/\/+$/, "");
  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.1,
        response_format: { type: "json_object" },
      }),
    });
    if (!response.ok) {
      return {
        ok: false,
        reason: "http_error",
        provider: "nebius",
        latencyMs: elapsed(),
      };
    }
    const body = ((await response.json()) ?? {}) as CompletionBody;
    const content = body.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      return {
        ok: false,
        reason: "malformed_tool_call",
        provider: "nebius",
        latencyMs: elapsed(),
      };
    }
    return {
      ok: true,
      content,
      provider: "nebius",
      promptTokens: tokenCount(body.usage?.prompt_tokens),
      completionTokens: tokenCount(body.usage?.completion_tokens),
      latencyMs: elapsed(),
    };
  } catch (err) {
    return {
      ok: false,
      reason: isTimeout(err) ? "timeout" : "http_error",
      provider: "nebius",
      latencyMs: elapsed(),
    };
  }
};
