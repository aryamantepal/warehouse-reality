/**
 * Nemotron deliberator (plan Task B2). One Token Factory call per turn on the
 * role's model tier. Its reply is only a proposal: the tool call is Zod
 * validated here and the Run still routes it through the proposal adapter and
 * engine contracts. Anything that did not come from a valid Nemotron reply is
 * labeled a fallback, and an unusable reply proposes nothing.
 */

import type {
  Deliberator,
  FallbackReason,
  TurnDecision,
  TurnInput,
} from "../../types/run";
import { requestChatCompletion } from "./chat-completion";
import { modelFor } from "./models";
import { fallbackLocalDeliberation } from "./nebius-client";
import { buildDeliberationPrompt } from "./prompts";
import { AgentToolCallSchema } from "./schemas";
import type { AgentToolCall } from "./types";

export interface NemotronOptions {
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
}

const stripFence = (text: string): string =>
  text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");

type Parsed =
  | { ok: true; thought: string; toolCall?: AgentToolCall }
  | { ok: false };

const parseReply = (content: string): Parsed => {
  let raw: unknown;
  try {
    raw = JSON.parse(stripFence(content));
  } catch {
    return { ok: false };
  }
  if (typeof raw !== "object" || raw === null) return { ok: false };
  const { thought, toolCall } = raw as {
    thought?: unknown;
    toolCall?: unknown;
  };
  const text = typeof thought === "string" ? thought : "";
  if (toolCall === undefined || toolCall === null) {
    return text ? { ok: true, thought: text } : { ok: false };
  }
  const parsed = AgentToolCallSchema.safeParse(toolCall);
  if (!parsed.success) return { ok: false };
  return {
    ok: true,
    thought: text || "Deliberation complete.",
    toolCall: parsed.data as AgentToolCall,
  };
};

export const createNemotronDeliberator = (
  opts: NemotronOptions = {},
): Deliberator => ({
  kind: "nemotron",
  async decide(input: TurnInput): Promise<TurnDecision> {
    const env = opts.env ?? process.env;
    const model = modelFor(input.tier, env);
    const { agent } = input;
    const prompt = buildDeliberationPrompt(
      agent.role,
      agent.id,
      input.observation,
      input.inbox,
      agent.obligations,
      agent.memory.slice(-5),
    );
    const result = await requestChatCompletion(
      [{ role: "user", content: prompt }],
      model,
      { timeoutMs: opts.timeoutMs, env },
    );

    const baseCall = {
      agentId: agent.id,
      role: agent.role,
      tier: input.tier,
      model,
      latencyMs: result.latencyMs,
      logicalTime: input.logicalTime,
      stateVersion: input.stateVersion,
    };
    const fallback = (
      reason: FallbackReason,
      thought: string,
      toolCall?: AgentToolCall,
    ): TurnDecision => ({
      thought,
      toolCall,
      call: {
        ...baseCall,
        isFallback: true,
        fallbackReason: reason,
        promptTokens: result.ok ? result.promptTokens : null,
        completionTokens: result.ok ? result.completionTokens : null,
      },
    });

    if (!result.ok) {
      if (result.reason === "malformed_tool_call") {
        return fallback(
          "malformed_tool_call",
          "Model reply was unusable; no action taken.",
        );
      }
      // Infrastructure failure: the deterministic local rules stand in, labeled.
      const local = fallbackLocalDeliberation(
        agent.role,
        agent.id,
        input.observation,
        input.inbox as unknown as Array<Record<string, unknown>>,
        input.stateVersion,
      );
      return fallback(result.reason, local.thought, local.toolCall);
    }

    const parsed = parseReply(result.content);
    if (!parsed.ok) {
      return fallback(
        "malformed_tool_call",
        "Model reply was not a valid tool call; no action taken.",
      );
    }
    return {
      thought: parsed.thought,
      toolCall: parsed.toolCall,
      call: {
        ...baseCall,
        isFallback: false,
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
      },
    };
  },
});
