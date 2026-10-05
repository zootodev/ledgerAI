// ============================================================
// LedgerAI — Ask AI provider seam (spec §7)
// ------------------------------------------------------------
// Narrow contracts that replace the broad
// `FinancialAssistant.answer(question, context)` production seam.
// Providers:
//   - get a strict, redacted message payload and return `unknown`
//     (Zod-validated by trusted code before anything happens);
//   - must never import Prisma, finance services, conversation
//     persistence, server actions, or the tool registry;
//   - never perform a financial operation on behalf of the user.
// Selection here is server-only deployment configuration, never
// client input.
// ============================================================

import type { NarrationManifest } from "@/lib/ask/contracts";
import { DeterministicInterpreter, DeterministicNarrationPlanner } from "@/lib/ai/providers/deterministic";
import {
  OpenAiCompatibleInterpreter,
  OpenAiCompatibleNarrationPlanner,
} from "@/lib/ai/providers/openai-compatible";

export interface AskTurnMessages {
  system: string;
  user: string;
  promptVersion: string;
}

export interface NarrationPlannerInput {
  system: string;
  manifest: NarrationManifest;
  promptVersion: string;
}

export interface AskProviderOptions {
  signal: AbortSignal;
}

export interface AskInterpreterProvider {
  readonly name: string;
  readonly configured: boolean;
  /** Deployment-pinned model identifier, or null for the deterministic fallback. */
  readonly model: string | null;
  interpret(input: AskTurnMessages, options: AskProviderOptions): Promise<unknown>;
}

export interface NarrationPlannerProvider {
  readonly name: string;
  readonly configured: boolean;
  plan(input: NarrationPlannerInput, options: AskProviderOptions): Promise<unknown>;
}

export interface AskAiProvider {
  interpreter: AskInterpreterProvider;
  narrationPlanner: NarrationPlannerProvider;
}

/** Server-only feature flags (spec §13). No client override. */
export interface AskAiConfig {
  mode: "off" | "shadow" | "canary";
  interpreterEnabled: boolean;
  narrationEnabled: boolean;
  structuredStateWrite: boolean;
  shadowSampleRate: number;
  /**
   * Independent /ask-v2 surface gate (Phase 18C). Deliberately separate from
   * the v1 AI-mode flags above: deploying the v2 route must never auto-arm
   * the v1 AI canary seam, and v1 mode flags must never control v2 delivery.
   * Safe default OFF — existing deployments do not expose v2 on deploy.
   */
  askV2Enabled: boolean;
}

const TRUE = new Set(["1", "true", "yes", "on"]);

function bool(value: string | undefined): boolean {
  return value !== undefined && TRUE.has(value.toLowerCase());
}

/** Server-only flag reader. */
export function readAskAiConfig(env: NodeJS.ProcessEnv = process.env): AskAiConfig {
  const modeRaw = (env.ASK_LLM_MODE ?? "off").toLowerCase();
  const mode = modeRaw === "shadow" || modeRaw === "canary" ? modeRaw : "off";
  const sampleRaw = Number(env.ASK_SHADOW_SAMPLE_RATE ?? "0");
  return {
    mode,
    interpreterEnabled: bool(env.ASK_LLM_INTERPRETER_ENABLED),
    narrationEnabled: bool(env.ASK_LLM_NARRATION_ENABLED),
    structuredStateWrite: bool(env.ASK_STRUCTURED_STATE_WRITE),
    askV2Enabled: bool(env.ASK_V2_ENABLED),
    shadowSampleRate: Number.isFinite(sampleRaw)
      ? Math.min(Math.max(sampleRaw, 0), 1)
      : 0,
  };
}

/** True when an explicit AI provider (not `rules`/empty) is requested. */
export function isAiProviderConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  const provider = (env.AI_PROVIDER ?? "").trim().toLowerCase();
  return provider.length > 0 && provider !== "rules";
}

export interface AskAiRuntime {
  config: AskAiConfig;
  providers: AskAiProvider;
}

/**
 * Resolve the concrete ask provider set from server env (spec §7 selector).
 * Defaults to the deterministic providers: offline parity is guaranteed,
 * and `configured === false` tells the pipeline the interpreter bolted on
 * nothing. Provider/model selection is deployment config, never client input.
 */
export function getAskAi(env: NodeJS.ProcessEnv = process.env): AskAiRuntime {
  const config = readAskAiConfig(env);
  const providerConfigured = isAiProviderConfigured(env);
  const apiKey = env.AI_API_KEY;
  const baseUrl = (env.AI_BASE_URL ?? "https://api.openai.com/v1").trim();
  const model = env.AI_MODEL?.trim();

  const wiredInterpreter = providerConfigured && apiKey && apiKey.length > 0;
  const wiredNarration = wiredInterpreter && config.narrationEnabled;

  const interpreter = wiredInterpreter
    ? new OpenAiCompatibleInterpreter(env.AI_PROVIDER!.trim().toLowerCase(), {
        baseUrl,
        apiKey,
        model,
      })
    : new DeterministicInterpreter();

  const narrationPlanner = wiredNarration
    ? new OpenAiCompatibleNarrationPlanner(env.AI_PROVIDER!.trim().toLowerCase(), {
        baseUrl,
        apiKey,
        model,
      })
    : new DeterministicNarrationPlanner();

  return { config, providers: { interpreter, narrationPlanner } };
}