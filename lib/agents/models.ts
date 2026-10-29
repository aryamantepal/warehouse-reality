/**
 * Nemotron model tiers on Nebius Token Factory (plan Task B1).
 * Imports stay relative and type-only so `node scripts/*.ts` can load this file.
 */

import { z } from "zod";
import type { ModelTier } from "../../types/run";
import type { AgentRole } from "./types";

export const NEBIUS_DEFAULT_BASE_URL =
  "https://api.tokenfactory.us-central1.nebius.com/v1";

export const ANTHROPIC_TEST_DEFAULT_MODEL = "claude-haiku-5-5";

/** TEST-ONLY Claude model, used for every tier when no Nebius key is set. */
export const anthropicTestModel = (
  env: NodeJS.ProcessEnv = process.env,
): string => env.ANTHROPIC_TEST_MODEL?.trim() || ANTHROPIC_TEST_DEFAULT_MODEL;

export const MODEL_TIERS: readonly ModelTier[] = ["nano", "super", "ultra"];

// Plan Global Constraints defaults; the smoke test checks each against `GET /models`.
export const MODEL_BY_TIER: Readonly<Record<ModelTier, string>> = {
  nano: "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B",
  super: "nvidia/nemotron-3-super-120b-a12b",
  ultra: "nvidia/Nemotron-3-Ultra-550b-a55b",
};

export const MODEL_ENV_BY_TIER: Readonly<Record<ModelTier, string>> = {
  nano: "NEBIUS_MODEL_NANO",
  super: "NEBIUS_MODEL_SUPER",
  ultra: "NEBIUS_MODEL_ULTRA",
};

const TIER_BY_ROLE: Readonly<Record<AgentRole, ModelTier>> = {
  driver: "nano",
  dock_lead: "super",
  yard_controller: "super",
  supervisor: "ultra",
};

// A blank override (`NEBIUS_MODEL_ULTRA=` in .env) means "use the default".
const ModelOverride = z
  .string()
  .trim()
  .optional()
  .transform((id) => id || undefined);

export const tierForRole = (role: AgentRole): ModelTier => TIER_BY_ROLE[role];

export const modelFor = (
  tier: ModelTier,
  env: NodeJS.ProcessEnv = process.env,
): string =>
  ModelOverride.parse(env[MODEL_ENV_BY_TIER[tier]]) ?? MODEL_BY_TIER[tier];
