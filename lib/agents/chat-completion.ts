/**
 * One Token Factory chat completion for an explicit model (plan Task B2).
 * Never throws and never echoes the key. Token usage is null when the provider
 * does not report it. Server-side only.
 */

import { NEBIUS_DEFAULT_BASE_URL } from "./models";
import type { LLMMessage } from "./nebius-client";

export const TOKEN_FACTORY_TIMEOUT_MS = 20_000;

export type ChatCompletionResult =
  | {
      ok: true;
      content: string;
      promptTokens: number | null;
      completionTokens: number | null;
      latencyMs: number;
    }
  | {
      ok: false;
      reason: "no_api_key" | "http_error" | "timeout" | "malformed_tool_call";
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

export const requestChatCompletion = async (
  messages: LLMMessage[],
  model: string,
  opts: { timeoutMs?: number; env?: NodeJS.ProcessEnv } = {},
): Promise<ChatCompletionResult> => {
  const env = opts.env ?? process.env;
  const started = Date.now();
  const elapsed = () => Date.now() - started;
  const apiKey = env.NEBIUS_API_KEY?.trim();
  if (!apiKey) return { ok: false, reason: "no_api_key", latencyMs: elapsed() };
  const baseUrl = (
    env.NEBIUS_BASE_URL?.trim() || NEBIUS_DEFAULT_BASE_URL
  ).replace(/\/+$/, "");
  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      signal: AbortSignal.timeout(opts.timeoutMs ?? TOKEN_FACTORY_TIMEOUT_MS),
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
      return { ok: false, reason: "http_error", latencyMs: elapsed() };
    }
    const body = ((await response.json()) ?? {}) as CompletionBody;
    const content = body.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      return { ok: false, reason: "malformed_tool_call", latencyMs: elapsed() };
    }
    return {
      ok: true,
      content,
      promptTokens: tokenCount(body.usage?.prompt_tokens),
      completionTokens: tokenCount(body.usage?.completion_tokens),
      latencyMs: elapsed(),
    };
  } catch (err) {
    return {
      ok: false,
      reason: isTimeout(err) ? "timeout" : "http_error",
      latencyMs: elapsed(),
    };
  }
};
