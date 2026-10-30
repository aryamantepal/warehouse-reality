/**
 * Nebius / NVIDIA Token Factory client (PRD §1, §6): one OpenAI-compatible
 * tool-calling chat completion with strict error boundaries.
 */

import { z } from "zod";
import type { FallbackReason } from "../../types/run";
import type { ChatTool } from "./tool-definitions";

/** Characters of an upstream error body kept for logs. */
const ERROR_DETAIL_CHARS = 200;

const describeError = (err: unknown): string =>
  err instanceof Error ? `${err.name}: ${err.message}` : String(err);

/** Upstream error text made safe to log: key redacted, length capped. */
const redactDetail = (detail: string, apiKey: string): string =>
  detail.replaceAll(apiKey, "[redacted]").slice(0, ERROR_DETAIL_CHARS);

// Token Factory chat completion (docs.tokenfactory.nebius.com, create-chat-completion).
// Read leniently: an odd usage field or tool call never discards the rest of
// the reply. Reasoning models may also return `reasoning_content` or `reasoning`.
const TokenCount = z.number().int().nonnegative().nullable().catch(null);

const CompletionSchema = z.object({
  choices: z.array(z.unknown()).catch([]),
  usage: z
    .object({ prompt_tokens: TokenCount, completion_tokens: TokenCount })
    .nullable()
    .catch(null),
});

const MessageSchema = z.object({
  finish_reason: z.string().nullish(),
  message: z.object({
    content: z.string().nullish(),
    reasoning_content: z.string().nullish(),
    reasoning: z.string().nullish(),
    tool_calls: z.array(z.unknown()).nullish(),
  }),
});

// Some OpenAI-compatible servers send arguments as an object, or null for none.
const ToolCallEntrySchema = z.object({
  function: z.object({
    name: z.string(),
    arguments: z
      .union([z.string(), z.record(z.string(), z.unknown()), z.null()])
      .optional()
      .transform((args) =>
        typeof args === "string" ? args : JSON.stringify(args ?? {}),
      ),
  }),
});

export interface ToolCallRequest {
  apiKey: string;
  baseUrl: string;
  model: string;
  messages: ReadonlyArray<{ role: "system" | "user"; content: string }>;
  tools: readonly ChatTool[];
  timeoutMs: number;
  maxTokens: number;
}

export type ToolCallResponse =
  | {
      ok: true;
      latencyMs: number;
      // null when the provider did not report usage; never guessed.
      promptTokens: number | null;
      completionTokens: number | null;
      finishReason: string | null;
      content: string | null;
      reasoning: string | null;
      /** The first tool call; a turn makes one. */
      toolCall: { name: string; arguments: string } | null;
      /** Why the reply's message or tool call could not be read, if so. */
      unreadable: string | null;
    }
  | {
      ok: false;
      reason: Extract<FallbackReason, "http_error" | "timeout">;
      /** Safe to log: the API key is redacted. */
      detail: string;
      latencyMs: number;
    };

type ChoiceFields = Pick<
  Extract<ToolCallResponse, { ok: true }>,
  "finishReason" | "content" | "reasoning" | "toolCall" | "unreadable"
>;

const UNREADABLE_CHOICE: ChoiceFields = {
  finishReason: null,
  content: null,
  reasoning: null,
  toolCall: null,
  unreadable: "no readable message",
};

const readChoice = (choice: unknown): ChoiceFields => {
  const parsed = MessageSchema.safeParse(choice);
  if (!parsed.success) return UNREADABLE_CHOICE;
  const { message, finish_reason } = parsed.data;
  const first = message.tool_calls?.[0];
  const call =
    first === undefined ? undefined : ToolCallEntrySchema.safeParse(first);
  return {
    finishReason: finish_reason ?? null,
    content: message.content ?? null,
    reasoning: message.reasoning_content ?? message.reasoning ?? null,
    toolCall: call?.success ? call.data.function : null,
    unreadable:
      call && !call.success ? "tool call entry has no readable function" : null,
  };
};

/**
 * One OpenAI-compatible chat completion with tools. Never throws for transport
 * or provider failures: HTTP errors, network errors and unreadable bodies are
 * `http_error`, and no response within `timeoutMs` is `timeout`.
 */
export const requestToolCall = async ({
  apiKey,
  baseUrl,
  model,
  messages,
  tools,
  timeoutMs,
  maxTokens,
}: ToolCallRequest): Promise<ToolCallResponse> => {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const fail = (
    reason: "http_error" | "timeout",
    detail: string,
  ): ToolCallResponse => ({
    ok: false,
    reason,
    detail: redactDetail(detail, apiKey),
    latencyMs: Date.now() - started,
  });

  try {
    const response = await fetch(
      `${baseUrl.replace(/\/+$/, "")}/chat/completions`,
      {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          tools,
          // Documented by Token Factory; with the `wait` tool, a turn always has a call.
          tool_choice: "required",
          temperature: 0.1,
          max_tokens: maxTokens,
        }),
      },
    );
    if (!response.ok) {
      return fail(
        "http_error",
        `HTTP ${response.status} ${await response.text()}`,
      );
    }
    const parsed = CompletionSchema.safeParse(await response.json());
    if (!parsed.success) return fail("http_error", "unexpected response shape");
    return {
      ok: true,
      latencyMs: Date.now() - started,
      promptTokens: parsed.data.usage?.prompt_tokens ?? null,
      completionTokens: parsed.data.usage?.completion_tokens ?? null,
      ...readChoice(parsed.data.choices[0]),
    };
  } catch (err) {
    return controller.signal.aborted
      ? fail("timeout", `no response within ${timeoutMs} ms`)
      : fail("http_error", describeError(err));
  } finally {
    clearTimeout(timer);
  }
};
