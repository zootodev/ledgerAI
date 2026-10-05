// ============================================================
// LedgerAI — Ask v2 LLM interpreter boundary (Phase 3)
// ------------------------------------------------------------
// The ISOLATED interpretation layer for /ask-v2.
//
// Boundary:
//   User message
//     → bounded conversation history
//     → LLM interpreter (reusing the existing AI provider seam)
//     → strict AskV2 proposal (Zod-validated)
//     → Phase 2 policy -> executor -> canonical finance engine
//
// The LLM decides WHAT the user means. The trusted finance layer decides
// what is financially true. The LLM never produces authoritative figures.
//
// Hard rules held here:
//   - input carries ONLY message + bounded history + date; no tenant
//     context, ids, database handles, credentials, or financial data;
//   - raw provider output is `unknown` until it parses against the strict
//     interpretation wrapper (which wraps, never duplicates, the canonical
//     askV2ProposalSchema);
//   - a provider that is unconfigured, errored, timed out, or malformed
//     yields a TYPED non-answer — this boundary never fabricates a
//     meaning and never returns a financial result;
//   - there is deliberately NO deterministic rules/phrase interpeler here
//     (v2 is LLM-first; deterministic code owns validation/policy/execution).
// ============================================================

import { z } from "zod";
import type { AskAiRuntime } from "@/lib/ai/ask-provider";
import { getAskAi } from "@/lib/ai/ask-provider";
import {
  askV2ProposalSchema,
  askV2ClarificationReasonSchema,
  askV2UnsupportedReasonSchema,
  type AskV2Proposal,
  type AskV2ClarificationReason,
  type AskV2UnsupportedReason,
} from "./contracts";
import {
  ASK_V2_INTERPRETER_PROMPT_VERSION,
  buildAskV2InterpreterMessages,
} from "./prompts";

/** One history turn the interpreter may use to ground references. */
export interface AskV2ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * The ONLY structured output the model may emit. It wraps (never duplicates)
 * the canonical proposal contract; extra fields are rejected by `.strict()`.
 */
export const askV2InterpretationSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("proposal"),
      proposal: askV2ProposalSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("clarification"),
      reason: askV2ClarificationReasonSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("unsupported"),
      reason: askV2UnsupportedReasonSchema,
    })
    .strict(),
]);
export type AskV2Interpretation = z.infer<typeof askV2InterpretationSchema>;

/** Redacted, safe-to-log provider metadata (never a secret). */
export interface AskV2ProviderMetadata {
  name: string;
  configured: boolean;
  model: string | null;
  promptVersion: string;
}

export interface AskV2InterpretInput {
  /** The current user message. */
  message: string;
  /** Bounded prior turns (chronological); used only to ground references. */
  history: AskV2ConversationMessage[];
  /** Wall-clock date for period references in the prompt. */
  now?: Date;
  /** Caller-provided abort (defaults to a hard deadline). */
  signal?: AbortSignal;
  /** Injectable runtime for tests; defaults to the server env selection. */
  ai?: AskAiRuntime;
}

export type AskV2InterpretResult =
  | { kind: "success"; proposal: AskV2Proposal; provider: AskV2ProviderMetadata }
  | { kind: "clarification"; reason: AskV2ClarificationReason; provider: AskV2ProviderMetadata }
  | { kind: "unsupported"; reason: AskV2UnsupportedReason; provider: AskV2ProviderMetadata }
  | { kind: "provider_unavailable"; provider: AskV2ProviderMetadata }
  | { kind: "provider_timeout"; provider: AskV2ProviderMetadata }
  | { kind: "invalid_provider_output"; provider: AskV2ProviderMetadata };

/** Hard deadline for one on-path interpreter call (mirrors shadow timing). */
export const ASK_V2_INTERPRETER_TIMEOUT_MS = 15000;

/**
 * Interpret one user message into a structured AskV2 proposal (or a typed
 * clarification/unsupported/failure). Reuses the existing AI provider seam;
 * raw output is never trusted until it parses against the strict schema.
 */
export async function interpretAskV2(
  input: AskV2InterpretInput,
): Promise<AskV2InterpretResult> {
  const ai = input.ai ?? getAskAi();
  const provider = ai.providers.interpreter;

  const metadata: AskV2ProviderMetadata = {
    name: provider.name,
    configured: provider.configured,
    model: provider.model,
    promptVersion: ASK_V2_INTERPRETER_PROMPT_VERSION,
  };

  // Like /ask, interpretation only engages under an explicit server deploy
  // config (a wired provider AND ASK_LLM_MODE != off). With no provider there
  // is NOTHING deterministic here: v2 has no rules/phrase NLU, so we must not
  // fabricate an interpretation — report the gap as a typed non-answer.
  if (!provider.configured || ai.config.mode === "off") {
    return { kind: "provider_unavailable", provider: metadata };
  }

  const messages = buildAskV2InterpreterMessages({
    now: input.now ?? new Date(),
    message: input.message,
    history: input.history,
  });

  let raw: unknown;
  try {
    raw = await provider.interpret(messages, {
      signal: input.signal ?? AbortSignal.timeout(ASK_V2_INTERPRETER_TIMEOUT_MS),
    });
  } catch (error) {
    if (isInterpreterAbort(error)) {
      return { kind: "provider_timeout", provider: metadata };
    }
    if (process.env.ASK_DEBUG === "1") {
      console.error(
        "[ask-v2] " +
          JSON.stringify({
            event: "interpretation.provider_error",
            operation: "interpreter",
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
    return { kind: "provider_unavailable", provider: metadata };
  }

  const parsed = askV2InterpretationSchema.safeParse(raw);
  if (!parsed.success) {
    return { kind: "invalid_provider_output", provider: metadata };
  }

  switch (parsed.data.kind) {
    case "proposal":
      return { kind: "success", proposal: parsed.data.proposal, provider: metadata };
    case "clarification":
      return { kind: "clarification", reason: parsed.data.reason, provider: metadata };
    case "unsupported":
      return { kind: "unsupported", reason: parsed.data.reason, provider: metadata };
  }
}

/** Recognize Node TimeoutError and classic AbortError as a deadline hit. */
function isInterpreterAbort(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  );
}