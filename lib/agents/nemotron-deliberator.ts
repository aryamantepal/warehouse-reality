/**
 * Nemotron deliberator (plan Task B2): one agent turn per Token Factory chat
 * completion on the agent's model tier. Only a valid tool call (or an explicit
 * `wait`) counts as Nemotron output. Everything else is a labeled fallback
 * with its reason: no key, an HTTP or network error, a 20 s timeout, or a reply
 * without a valid tool call. Without any Nemotron answer the role's FCFS
 * baseline rules act; a malformed answer takes no action. Server-only: it reads
 * NEBIUS_API_KEY.
 */

import { z } from "zod";
import type {
  Deliberator,
  FallbackReason,
  ModelProvider,
  TurnDecision,
  TurnInput,
} from "../../types/run";
import {
  BaselineDeliberator,
  D108_BASELINE_POLICY,
} from "../run/baseline-deliberator";
import { AgentRunner } from "./agent-runner";
import {
  anthropicTestModel,
  requestAnthropicToolCall,
  selectProvider,
} from "./anthropic-client";
import { modelFor, NEBIUS_DEFAULT_BASE_URL } from "./models";
import { requestToolCall, type ToolCallResponse } from "./nebius-client";
import { buildTurnMessages, type TurnContext } from "./prompts";
import { AGENT_CHAT_TOOLS, parseToolCall } from "./tool-definitions";

export const NEMOTRON_TIMEOUT_MS = 20_000;
/** Completion cap per turn, reasoning included; same as the smoke test default. */
export const NEMOTRON_MAX_TOKENS = 4096;
/** Model label on every fallback call, so a fallback never shows a Nemotron id. */
export const FALLBACK_MODEL = "deterministic-local-fallback";
/** Longest model text kept as a turn's thought (it lands in RunEvent summaries). */
const MAX_THOUGHT_CHARS = 600;

const blankToUndefined = z
  .string()
  .trim()
  .optional()
  .transform((value) => value || undefined);

const NebiusEnv = z.object({
  NEBIUS_API_KEY: blankToUndefined,
  NEBIUS_BASE_URL: blankToUndefined.pipe(z.url().optional()),
});

interface Usage {
  latencyMs: number;
  promptTokens: number | null;
  completionTokens: number | null;
}

const NO_USAGE: Usage = {
  latencyMs: 0,
  promptTokens: null,
  completionTokens: null,
};

const callOf = (
  input: TurnInput,
  model: string,
  usage: Usage,
  fallbackReason?: FallbackReason,
  provider?: ModelProvider,
): TurnDecision["call"] => ({
  agentId: input.agent.id,
  role: input.agent.role,
  tier: input.tier,
  model,
  ...(provider ? { provider } : {}),
  isFallback: fallbackReason !== undefined,
  ...(fallbackReason ? { fallbackReason } : {}),
  latencyMs: usage.latencyMs,
  promptTokens: usage.promptTokens,
  completionTokens: usage.completionTokens,
  logicalTime: input.logicalTime,
  stateVersion: input.stateVersion,
});

/**
 * Who the agent works with and the D-108 facts its role cannot observe, from
 * the same roster and policy the Run and the baseline use. Scenario values.
 */
const D108_TURN_CONTEXT: TurnContext = {
  roster: new AgentRunner()
    .getAllAgents()
    .map(({ id, role, assignedEntityId }) => ({ id, role, assignedEntityId })),
  scenarioFacts: {
    provenance: "scenario",
    relocationTargetDocks: D108_BASELINE_POLICY.compatibleDocks,
    driverByTrailer: D108_BASELINE_POLICY.driverByTrailer,
    yardAgentId: D108_BASELINE_POLICY.yardAgentId,
    cargoToUnloadAfterRelocation: D108_BASELINE_POLICY.unload,
  },
};

type LocalReason = Extract<
  FallbackReason,
  "no_api_key" | "http_error" | "timeout"
>;

/** No Nemotron answer at all: the role's baseline rules decide, labeled. */
const localFallback = async (
  fallback: Deliberator,
  input: TurnInput,
  reason: LocalReason,
  usage: Usage,
): Promise<TurnDecision> => {
  const local = await fallback.decide(input);
  return {
    thought: `Fallback (${reason}): ${local.thought}`,
    ...(local.toolCall ? { toolCall: local.toolCall } : {}),
    call: callOf(input, FALLBACK_MODEL, usage, reason),
  };
};

/**
 * Nemotron answered but not with a valid tool call. Its text is not used, and
 * the turn takes no action; the tokens it spent still count against `model`.
 */
const malformed = (
  input: TurnInput,
  model: string,
  detail: string,
  usage: Usage,
  provider?: ModelProvider,
): TurnDecision => ({
  thought: `Fallback (malformed_tool_call): ${model} replied without a valid tool call (${detail}); no action this turn.`,
  call: callOf(input, model, usage, "malformed_tool_call", provider),
});

const thoughtOf = (
  reply: Extract<ToolCallResponse, { ok: true }>,
  fallback: string,
): string =>
  (reply.content?.trim() || reply.reasoning?.trim() || fallback).slice(
    0,
    MAX_THOUGHT_CHARS,
  );

const fromReply = (
  input: TurnInput,
  model: string,
  reply: Extract<ToolCallResponse, { ok: true }>,
  provider?: ModelProvider,
): TurnDecision => {
  const usage: Usage = reply;
  if (reply.unreadable)
    return malformed(input, model, reply.unreadable, usage, provider);
  if (!reply.toolCall) {
    const why =
      reply.finishReason === "length"
        ? "cut off at the token cap"
        : reply.content?.trim()
          ? "text only"
          : "no content";
    return malformed(input, model, why, usage, provider);
  }
  const parsed = parseToolCall(reply.toolCall.name, reply.toolCall.arguments);
  switch (parsed.kind) {
    case "invalid":
      return malformed(input, model, parsed.detail, usage, provider);
    case "wait":
      return {
        thought: parsed.reason.slice(0, MAX_THOUGHT_CHARS),
        call: callOf(input, model, usage, undefined, provider),
      };
    case "tool":
      return {
        thought: thoughtOf(reply, `Called ${parsed.toolCall.tool}.`),
        toolCall: parsed.toolCall,
        call: callOf(input, model, usage, undefined, provider),
      };
  }
};

const decide = async (
  fallback: Deliberator,
  input: TurnInput,
): Promise<TurnDecision> => {
  const env = NebiusEnv.safeParse(process.env);
  if (!env.success) throw new Error("NEBIUS_BASE_URL is not a valid URL.");
  const provider = selectProvider(process.env);
  const apiKey =
    provider === "anthropic"
      ? process.env.ANTHROPIC_API_KEY?.trim()
      : env.data.NEBIUS_API_KEY;
  if (!apiKey) return localFallback(fallback, input, "no_api_key", NO_USAGE);

  // TEST ONLY: with no Nebius key, a Claude model answers every tier.
  const model =
    provider === "anthropic" ? anthropicTestModel() : modelFor(input.tier);
  const messages = buildTurnMessages(input, D108_TURN_CONTEXT);
  const reply =
    provider === "anthropic"
      ? await requestAnthropicToolCall({
          apiKey,
          model,
          messages,
          tools: AGENT_CHAT_TOOLS,
          timeoutMs: NEMOTRON_TIMEOUT_MS,
          maxTokens: NEMOTRON_MAX_TOKENS,
        })
      : await requestToolCall({
          apiKey,
          baseUrl: env.data.NEBIUS_BASE_URL ?? NEBIUS_DEFAULT_BASE_URL,
          model,
          messages,
          tools: AGENT_CHAT_TOOLS,
          timeoutMs: NEMOTRON_TIMEOUT_MS,
          maxTokens: NEMOTRON_MAX_TOKENS,
        });
  if (!reply.ok) {
    // `detail` is already redacted by the client.
    console.warn(
      `${provider} ${model} turn for ${input.agent.id} fell back (${reply.reason}): ${reply.detail}`,
    );
    return localFallback(fallback, input, reply.reason, {
      latencyMs: reply.latencyMs,
      promptTokens: null,
      completionTokens: null,
    });
  }
  return fromReply(input, model, reply, provider);
};

/** `fallback` acts when there is no Nemotron answer; D-108 FCFS by default. */
export const createNemotronDeliberator = (
  fallback: Deliberator = new BaselineDeliberator(),
): Deliberator => ({
  kind: "nemotron",
  decide: (input) => decide(fallback, input),
});
