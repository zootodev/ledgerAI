// ============================================================
// LedgerAI — Ask v2 narrator boundary (Phase 4)
// ------------------------------------------------------------
// The isolated narration layer for /ask-v2.
//
// Boundary:
//   Verified result (purified fact manifest + deterministic text)
//     → bounded conversational context
//     → LLM narrator (reusing the existing AI provider seam)
//     → strict `{ answer: string }` output
//     → deterministic grounding validation
//
// The narrator explains VERIFIED financial facts in natural language.
// It never receives tenant context, ids, database handles, credentials,
// raw metrics, or the finance engine. It cannot calculate: any figure
// it cites must already exist in the manifest, and the grounding check
// rejects anything that is not present there.
//
// Hard rules held here:
//   - input carries ONLY the purified manifest (verified facts), the user
//     message, and bounded history — nothing else;
//   - raw provider output is `unknown` until it parses against the strict
//     narration wrapper;
//   - a provider that is unconfigured, errored, timed out, malformed, or
//     whose narration is not grounded yields the DETERMINISTIC fallback —
//     this boundary never fabricates a figure or an inference;
//   - there is deliberately NO deterministic prose generator here (v2 is
//     LLM-first for wording; deterministic code owns fallback/grounding).
// ============================================================

import { z } from "zod";
import type { AskAiRuntime } from "@/lib/ai/ask-provider";
import { getAskAi } from "@/lib/ai/ask-provider";
import type { NarrationManifest } from "@/lib/ask/contracts";
import type { AskV2ConversationMessage } from "./interpreter";
import {
  ASK_V2_NARRATOR_PROMPT_VERSION,
  buildNarratorMessages,
} from "./narrator-prompt";
import { isNarrationGrounded } from "./grounding";

/**
 * The ONLY structured output the narrator may emit. Extra fields are
 * rejected by `.strict()`.
 */
export const askV2NarrationSchema = z
  .object({
    answer: z.string().min(1).max(4000),
  })
  .strict();
export type AskV2Narration = z.infer<typeof askV2NarrationSchema>;

/** Redacted, safe-to-log provider metadata (never a secret). */
export interface AskV2NarratorProviderMetadata {
  name: string;
  configured: boolean;
  model: string | null;
  promptVersion: string;
}

export interface AskV2NarrateInput {
  /** The current user message. */
  userMessage: string;
  /** Bounded prior turns (chronological); used only for conversational flow. */
  history: AskV2ConversationMessage[];
  /** Purified verified facts the narrator may reference. */
  manifest: NarrationManifest;
  /** The verified deterministic text to fall back to on any failure. */
  deterministicText: string;
  /** Wall-clock date for period references in the prompt. */
  now?: Date;
  /** Caller-provided abort (defaults to a hard deadline). */
  signal?: AbortSignal;
  /** Injectable runtime for tests; defaults to the server env selection. */
  ai?: AskAiRuntime;
}

export type NarratorFallbackReason =
  | "provider_unavailable"
  | "provider_timeout"
  | "invalid_provider_output"
  | "not_grounded";

export type AskV2NarrateResult =
  | { kind: "answer"; text: string; provider: AskV2NarratorProviderMetadata }
  | {
      kind: "fallback";
      text: string;
      reason: NarratorFallbackReason;
      provider: AskV2NarratorProviderMetadata;
    };

/** Hard deadline for one on-path narrator call (mirrors interpretation). */
export const ASK_V2_NARRATOR_TIMEOUT_MS = 8000;

/**
 * Narrate a verified plan outcome in natural language. Always returns a
 * serveable `text`: either the LLM wording that passed grounding, or the
 * verified deterministic text. Never fabricates.
 */
export async function narrateAskV2(
  input: AskV2NarrateInput,
): Promise<AskV2NarrateResult> {
  const ai = input.ai ?? getAskAi();
  const provider = ai.providers.interpreter;

  const metadata: AskV2NarratorProviderMetadata = {
    name: provider.name,
    configured: provider.configured,
    model: provider.model,
    promptVersion: ASK_V2_NARRATOR_PROMPT_VERSION,
  };

  const fallback = (reason: NarratorFallbackReason): AskV2NarrateResult => ({
    kind: "fallback",
    text: input.deterministicText,
    reason,
    provider: metadata,
  });

  // Narration only engages under an explicit server deploy config (a wired
  // provider AND ASK_LLM_MODE != off). With no provider there is no LLM
  // wording — serve the verified deterministic text.
  if (!provider.configured || ai.config.mode === "off") {
    return fallback("provider_unavailable");
  }

  const messages = buildNarratorMessages({
    now: input.now ?? new Date(),
    userMessage: input.userMessage,
    history: input.history,
    manifest: input.manifest,
    deterministicFallback: input.deterministicText,
  });

  let raw: unknown;
  try {
    raw = await provider.interpret(messages, {
      signal: input.signal ?? AbortSignal.timeout(ASK_V2_NARRATOR_TIMEOUT_MS),
    });
  } catch (error) {
    if (isNarratorAbort(error)) {
      return fallback("provider_timeout");
    }
    if (process.env.ASK_DEBUG === "1") {
      console.error(
        "[ask-v2] " +
          JSON.stringify({
            event: "narration.provider_error",
            operation: "narrator",
            provider: metadata.name,
            model: metadata.model,
            promptVersion: metadata.promptVersion,
            errorName: error instanceof Error ? error.name : "unknown",
            errorMessage:
              error instanceof Error
                ? error.message.slice(0, 300)
                : String(error).slice(0, 300),
          }),
      );
    }
    return fallback("provider_unavailable");
  }

  const parsed = askV2NarrationSchema.safeParse(raw);
  if (!parsed.success) {
    return fallback("invalid_provider_output");
  }

  const grounded = isNarrationGrounded(parsed.data.answer, input.manifest);
  if (!grounded.ok) {
    return fallback("not_grounded");
  }

  return { kind: "answer", text: parsed.data.answer.trim(), provider: metadata };
}

/** Recognize Node TimeoutError and classic AbortError as a deadline hit. */
function isNarratorAbort(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  );
}