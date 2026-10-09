// ============================================================
// LedgerAI — Ask v2 server action (Phase 2 foundation + Phase 3
// interpreter surface + Phase 4 narrator/grounding)
// ------------------------------------------------------------
// The ONLY v2 surface the browser can call. Mirrors the v1 server action
// shape (auth-first, ownership/tenant context from the session, typed
// user-safe results, AuthorizationError re-thrown so the client bounces
// to /login), but speaks ONLY ask-v2 boundary contracts.
//
// Boundaries:
//   1. authenticate via requireAuthContext() — businessId is derived
//      HERE from the session, never from the client, the proposal, or the
//      interpreter;
//   2. validate the v2 request contract (strict: tenant fields can never
//      pass);
//   3a. (Phase 2, deterministic) a caller-supplied proposal goes straight
//       through policy;
//   3b. (Phase 3, LLM-first) a caller message -> bounded history -> LLM
//       interpreter -> strict AskV2 proposal;
//   4. policy decides disposition (answer / clarification / unsupported);
//   5. the trusted executor runs the deterministic finance engine and
//      returns VERIFIED figures — nothing is model-authored;
//   6. (Phase 4) the narrator may re-word the VERIFIED result in natural
//      language, but it can only ever receive the purified fact manifest +
//      message + history (never tenant ids/Prisma/SQL/data), and any LLM
//      wording that fails the deterministic grounding check is replaced by
//      the verified deterministic text;
//   7. answer turns are persisted tenant-scoped (the user message is what
//      is stored, giving future turns real grounding).
//
// Phase 2 is deterministic-only. Phase 3 adds the interpreter boundary;
// Phase 4 adds the narrator+grounding boundary — the AI provider seam is an
// explicit deploy-config opt-in, its raw output is Zod-validated before
// anything happens, and it can NEVER produce, invent, or calculate a
// financial figure (grounding enforces this).
// ============================================================

"use server";

import { performance } from "node:perf_hooks";
import { z } from "zod";
import { newTraceId } from "@/lib/observability/ask-trace";
import {
  createAskV2Trace,
  emitAskV2Trace,
  type AskV2Trace,
  type AskV2TraceResultKind,
} from "@/lib/observability/ask-v2-trace";
import { isAskV2Enabled } from "@/lib/ask-v2/config";
import { requireAuthContext } from "@/lib/services/auth-context";
import {
  consumeConfiguredLimit,
  RATE_LIMIT_EXCEEDED_MESSAGE,
} from "@/lib/security/rate-limit";
import {
  persistAssistantExchange,
  findRecentOwnedExchanges,
  ConversationNotFoundError,
} from "@/lib/services/assistant-conversations";
import {
  interpretAskV2,
  type AskV2ConversationMessage,
} from "@/lib/ask-v2/interpreter";
import {
  narrateAskV2,
  type AskV2NarratorProviderMetadata,
  type NarratorFallbackReason,
} from "@/lib/ask-v2/narrator";
import { buildFactManifest } from "@/lib/finance/facts";
import {
  clarificationText,
  conversationTitle,
  UNSUPPORTED_ANSWER,
} from "@/lib/finance/assistant";
import { askV2PolicyDecision, askV2PolicyContextFromExchanges } from "@/lib/ask-v2/policy";
import { buildAskV2Anchor } from "@/lib/ask-v2/anchor";
import { executeAskV2Plan } from "@/lib/ask-v2/executor";
import {
  askV2ResponseSchema,
  askV2RequestSchema,
  type AskV2Request,
  type AskV2Response,
  type AskV2PlanOutcome,
} from "@/lib/ask-v2/contracts";

/* ------------------------------------------------------------
 * Phase 3 message surface (LLM-first)
 * ------------------------------------------------------------ */

const askV2AskInputSchema = z
  .object({
    message: z.string().trim().min(1).max(2000),
    conversationId: z.string().uuid().nullable().optional(),
  })
  .strict();
type AskV2AskInput = z.infer<typeof askV2AskInputSchema>;

/** Stable, honest message for capabilities the engine does not yet expose. */
function unsupportedText(reason: "not_financial" | "not_supported"): string {
  if (reason === "not_supported") {
    return "LedgerAI can analyze your income, expenses, profit, balance, transactions, and spending by category — but cannot search raw transaction text in this phase.";
  }
  return UNSUPPORTED_ANSWER;
}

function interpretationRunFailure(
  kind:
    | "provider_unavailable"
    | "provider_timeout"
    | "invalid_provider_output",
): AskV2Response {
  const text =
    kind === "provider_timeout"
      ? "The AI assistant took too long to respond. Please try again."
      : kind === "provider_unavailable"
        ? "The AI assistant isn't available right now. Please try again shortly."
        : "LedgerAI could not understand that message. Please try again.";
  return { disposition: "unsupported", reason: "not_supported", text, conversationId: null };
}

/** Map a v2 interpreter failure kind onto the trace result kind. */
function traceResultKind(
  kind: "provider_unavailable" | "provider_timeout" | "invalid_provider_output",
): Extract<AskV2TraceResultKind, "provider_unavailable" | "provider_timeout" | "invalid_provider_output"> {
  return kind;
}

/** Map the narration outcome onto the final served-result kind. */
function traceNarrationResultKind(narration: NarratedAnswer): AskV2TraceResultKind {
  switch (narration.kind) {
    case "narrated":
      return "grounded_answer";
    case "fallback":
      return "narration_fallback";
    case "not_attempted":
      return "answer";
  }
}

function goneResponse(): AskV2Response {
  return {
    disposition: "unsupported",
    reason: "not_supported",
    text: "That conversation is no longer available. Starting a fresh one.",
    conversationId: null,
  };
}

/**
 * B-2 gate response: /ask-v2 is inert when ASK_V2_ENABLED is not true. The
 * gate is enforced in server code only — the client can never submit an
 * override, and no interpreter/narrator/executor/persistence ever runs.
 */
function v2DisabledResponse(): AskV2Response {
  return {
    disposition: "unsupported",
    reason: "not_supported",
    text: "The advanced Ask assistant isn't enabled for your workspace right now. Please try again shortly.",
    conversationId: null,
  };
}

/**
 * Phase 4 narrator+grounding wiring. Builds the PURIFIED verified fact
 * manifest from the executor's answer outcome, lets the narrator re-word it,
 * and returns the final serveable text. Every failure lands on the verified
 * deterministic text — the narrator can never serve an invented figure.
 *
 * Also surfaces redacted narration metadata (kind/reason/provider/prompt
 * version/latency) to the caller for the per-turn trace. This metadata is
 * telemetry-only, never exposed to the user and never persisted.
 */
interface NarratedAnswer {
  text: string;
  kind: "narrated" | "fallback" | "not_attempted";
  reason: NarratorFallbackReason | null;
  provider: AskV2NarratorProviderMetadata | null;
  latencyMs: number;
}

async function narrateVerifiedAnswer(input: {
  userMessage: string;
  history: AskV2ConversationMessage[];
  outcome: Extract<AskV2PlanOutcome, { kind: "answer" }>;
  currency: string;
  now: Date;
}): Promise<NarratedAnswer> {
  const { userMessage, history, outcome, currency, now } = input;

  // The verified fact manifest is derived deterministically from verified
  // metrics. If it cannot be built (insufficient data), there is nothing safe
  // to narrate over — serve the deterministic text verbatim.
  let built: ReturnType<typeof buildFactManifest>;
  try {
    built = buildFactManifest({
      query: outcome.query,
      metrics: outcome.metrics,
      currency,
      now,
    });
  } catch {
    return { text: outcome.answer.text, kind: "not_attempted", reason: null, provider: null, latencyMs: 0 };
  }
  if (!built) {
    return { text: outcome.answer.text, kind: "not_attempted", reason: null, provider: null, latencyMs: 0 };
  }

  const narrateStarted = performance.now();
  const narrated = await narrateAskV2({
    userMessage,
    history,
    manifest: built.manifest,
    deterministicText: outcome.answer.text,
    now,
  });
  const latencyMs = Math.max(0, Math.round(performance.now() - narrateStarted));

  // narrateAskV2 already runs the grounding check: an LLM wording that does
  // not survive grounding is replaced by the deterministic fallback there.
  if (narrated.kind === "answer") {
    return {
      text: narrated.text,
      kind: "narrated",
      reason: null,
      provider: narrated.provider,
      latencyMs,
    };
  }
  return {
    text: narrated.text,
    kind: "fallback",
    reason: narrated.reason,
    provider: narrated.provider,
    latencyMs,
  };
}

/**
 * Phase 3 boundary: a natural-language message. Sequence:
 * authenticate -> validate -> resolve conversation ownership -> load bounded
 * history -> LLM interpreter -> strict proposal -> policy -> executor ->
 * verified result (persisted). Never fabricates an answer; interpreter and
 * provider failures are typed non-answers.
 */
export async function askV2Ask(input: AskV2AskInput): Promise<AskV2Response> {
  // B-2: independent surface gate. Enforced server-side BEFORE any interpreter,
  // narrator, finance execution, persistence, or telemetry runs.
  if (!isAskV2Enabled()) return v2DisabledResponse();

  const traceId = newTraceId();
  const turnStart = performance.now();
  let interpreterLatencyMs = 0;
  let narratorLatencyMs = 0;

  // B-1: best-effort per-turn structured telemetry. Emission failure is
  // swallowed so telemetry can never change the user's answer, persistence,
  // or provider behavior.
  const emitV2Trace = (partial: Partial<AskV2Trace>): void => {
    try {
      emitAskV2Trace(
        createAskV2Trace({
          traceId,
          gate: "enabled",
          latencyMs: {
            total: Math.max(0, Math.round(performance.now() - turnStart)),
            interpreter: interpreterLatencyMs,
            narrator: narratorLatencyMs,
          },
          ...partial,
        }),
      );
    } catch {
      // telemetry failure must not affect the answer path
    }
  };

  const auth = await requireAuthContext();

  const rateLimit = await consumeConfiguredLimit("ask:v2:chat", auth.business.id);
  if (!rateLimit.ok) {
    emitV2Trace({ resultKind: "unsupported" });
    return {
      disposition: "unsupported",
      reason: "not_financial",
      text: RATE_LIMIT_EXCEEDED_MESSAGE,
      conversationId: null,
    };
  }

  const parsed = askV2AskInputSchema.safeParse(input);
  if (!parsed.success) {
    emitV2Trace({ resultKind: "unsupported" });
    return {
      disposition: "unsupported",
      reason: "not_financial",
      text: "LedgerAI could not read that request — try rephrasing it.",
      conversationId: null,
    };
  }

  const { message, conversationId } = parsed.data;

  // Ownership + existence of the target conversation (tenant-scoped, read-only).
  if (conversationId) {
    const owned = await auth.prisma.assistantConversation.findFirst({
      where: { id: conversationId, businessId: auth.business.id },
      select: { id: true },
    });
    if (!owned) {
      emitV2Trace({ resultKind: "unsupported" });
      return goneResponse();
    }
  }

  // Bounded, id-free prior turns for reference grounding (reuses the existing
  // conversation store; nothing private is ever sent to the interpreter).
  const recentExchanges = conversationId
    ? await findRecentOwnedExchanges(auth.prisma, auth.business.id, conversationId)
    : [];
  const history: AskV2ConversationMessage[] = recentExchanges
    .slice()
    .reverse()
    .flatMap(({ content, answer }) => [
      { role: "user", content },
      ...(answer ? [{ role: "assistant" as const, content: answer }] : []),
    ]);

  const interpreterStart = performance.now();
  const interpretation = await interpretAskV2({
    message,
    history,
    now: new Date(),
  });
  interpreterLatencyMs = Math.max(0, Math.round(performance.now() - interpreterStart));

  const interpreterTraceFields = {
    provider: interpretation.provider.name,
    model: interpretation.provider.model ?? null,
    interpreterPromptVersion: interpretation.provider.promptVersion,
  };

  switch (interpretation.kind) {
    case "clarification":
      emitV2Trace({
        ...interpreterTraceFields,
        resultKind: "clarification",
        policyDisposition: "clarified",
        providerAttempted: true,
        providerOutcome: "accepted",
        providerStatus: "ok",
      });
      return {
        disposition: "clarification",
        reason: interpretation.reason,
        text: clarificationText(interpretation.reason),
        conversationId: null,
      };
    case "unsupported":
      emitV2Trace({
        ...interpreterTraceFields,
        resultKind: "unsupported",
        providerAttempted: true,
        providerOutcome: "accepted",
        providerStatus: "ok",
      });
      return {
        disposition: "unsupported",
        reason: interpretation.reason,
        text: unsupportedText(interpretation.reason),
        conversationId: null,
      };
    case "provider_unavailable":
    case "provider_timeout":
    case "invalid_provider_output":
      emitV2Trace({
        ...interpreterTraceFields,
        resultKind: traceResultKind(interpretation.kind),
        providerAttempted: interpretation.provider.configured,
        providerOutcome: interpretation.provider.configured ? "fallback" : "not_used",
        providerStatus: interpretation.provider.configured
          ? interpretation.kind === "provider_timeout"
            ? "timeout"
            : interpretation.kind === "invalid_provider_output"
              ? "ok"
              : "transport_error"
          : "not_attempted",
      });
      return interpretationRunFailure(interpretation.kind);
  }

  // Validated proposal -> Phase 2 policy -> executor (same trusted path).
  // Referenced categories are grounded against the categories OWNED prior
  // VERIFIED turns established. Phase 9E prefers the strict structured anchor
  // persisted on each assistant row (derived from trusted execution data),
  // with Phase 9D narration re-reading retained as a compatibility fallback.
  const decision = askV2PolicyDecision(
    interpretation.proposal,
    askV2PolicyContextFromExchanges(recentExchanges),
    message,
  );
  if (decision.kind === "unsupported") {
    emitV2Trace({
      ...interpreterTraceFields,
      resultKind: "unsupported",
      policyDisposition: "unsupported",
      providerAttempted: true,
      providerOutcome: "accepted",
      providerStatus: "ok",
    });
    return {
      disposition: "unsupported",
      reason: decision.reason,
      text: unsupportedText(decision.reason),
      conversationId: null,
    };
  }
  if (decision.kind === "clarification") {
    emitV2Trace({
      ...interpreterTraceFields,
      resultKind: "clarification",
      policyDisposition: "clarified",
      providerAttempted: true,
      providerOutcome: "accepted",
      providerStatus: "ok",
    });
    return {
      disposition: "clarification",
      reason: decision.reason,
      text: clarificationText(decision.reason),
      conversationId: null,
    };
  }

  const executedAt = new Date();
  let outcome: AskV2PlanOutcome;
  try {
    outcome = await executeAskV2Plan(
      {
        prisma: auth.prisma,
        businessId: auth.business.id,
        currency: auth.business.currency,
        now: executedAt,
        traceId,
      },
      decision.plan,
      decision.query,
      decision.toolKeys,
    );
  } catch (error) {
    emitV2Trace({
      ...interpreterTraceFields,
      resultKind: "execution_error",
      policyDisposition: "executed",
      providerAttempted: true,
      providerOutcome: "accepted",
      providerStatus: "ok",
    });
    throw error;
  }

  if (outcome.kind === "unsupported") {
    emitV2Trace({
      ...interpreterTraceFields,
      resultKind: "unsupported",
      policyDisposition: "executed",
      toolKeys: decision.toolKeys,
      providerAttempted: true,
      providerOutcome: "accepted",
      providerStatus: "ok",
    });
    return {
      disposition: "unsupported",
      reason: outcome.reason,
      text: unsupportedText(outcome.reason),
      conversationId: null,
    };
  }
  if (outcome.kind === "clarification") {
    emitV2Trace({
      ...interpreterTraceFields,
      resultKind: "clarification",
      policyDisposition: "executed",
      toolKeys: decision.toolKeys,
      providerAttempted: true,
      providerOutcome: "accepted",
      providerStatus: "ok",
    });
    return {
      disposition: "clarification",
      reason: outcome.reason,
      text: clarificationText(outcome.reason),
      conversationId: null,
    };
  }

  // Phase 9E: the VERIFIED turn anchor is derived here — after trusted
  // execution produced the canonical query/metrics/toolKeys and BEFORE the
  // narrator runs. It is built exclusively from trusted execution data; the
  // narrated prose never contributes to it.
  const anchor = buildAskV2Anchor({
    query: outcome.query,
    metrics: outcome.metrics,
    toolKeys: outcome.toolKeys,
    verifiedAt: executedAt,
  });

  // Phase 4: verified-result narration + grounding. The narrator only ever
  // sees the PURIFIED verified fact manifest (never tenant context, ids, or
  // the finance engine), and its wording must survive the deterministic
  // grounding check or the verified deterministic text is served instead.
  let narration: NarratedAnswer;
  try {
    narration = await narrateVerifiedAnswer({
      userMessage: message,
      history,
      outcome,
      currency: auth.business.currency,
      now: executedAt,
    });
  } catch (error) {
    emitV2Trace({
      ...interpreterTraceFields,
      resultKind: "execution_error",
      policyDisposition: "executed",
      toolKeys: outcome.toolKeys,
      providerAttempted: true,
      providerOutcome: "accepted",
      providerStatus: "ok",
      narrationKind: "fallback",
      narrationFallbackReason: "invalid_provider_output",
    });
    throw error;
  }
  narratorLatencyMs = narration.latencyMs;
  const finalText = narration.text;

  try {
    const persisted = await persistAssistantExchange(
      auth.prisma,
      auth.business.id,
      conversationId ?? null,
      conversationTitle(outcome.query),
      message,
      finalText,
      anchor,
    );
    emitV2Trace({
      ...interpreterTraceFields,
      resultKind: traceNarrationResultKind(narration),
      policyDisposition: "executed",
      toolKeys: outcome.toolKeys,
      providerAttempted: true,
      providerOutcome: "accepted",
      providerStatus: "ok",
      narrationKind: narration.kind,
      narrationFallbackReason: narration.reason,
      groundingPassed: narration.kind === "narrated",
      narratorPromptVersion: narration.provider?.promptVersion ?? null,
    });
    return askV2ResponseSchema.parse({
      disposition: "answer",
      text: finalText,
      conversationId: persisted.conversationId,
    });
  } catch (error) {
    if (error instanceof ConversationNotFoundError) {
      emitV2Trace({ resultKind: "unsupported" });
      return goneResponse();
    }
    emitV2Trace({
      ...interpreterTraceFields,
      resultKind: "execution_error",
      policyDisposition: "executed",
      toolKeys: outcome.toolKeys,
      providerAttempted: true,
      providerOutcome: "accepted",
      providerStatus: "ok",
    });
    throw error;
  }
}

/**
 * One ask-v2 turn. Returns a typed, validated response; re-throws
 * AuthorizationError so an unauthenticated client redirects to /login.
 */
export async function askV2Turn(input: AskV2Request): Promise<AskV2Response> {
  // B-2: independent surface gate. Enforced server-side BEFORE any finance
  // execution, persistence, or telemetry runs.
  if (!isAskV2Enabled()) return v2DisabledResponse();

  const traceId = newTraceId();
  const turnStart = performance.now();

  const emitV2Trace = (partial: Partial<AskV2Trace>): void => {
    try {
      emitAskV2Trace(
        createAskV2Trace({
          traceId,
          gate: "enabled",
          latencyMs: {
            total: Math.max(0, Math.round(performance.now() - turnStart)),
            interpreter: 0,
            narrator: 0,
          },
          ...partial,
        }),
      );
    } catch {
      // telemetry failure must not affect the answer path
    }
  };

  const auth = await requireAuthContext();

  const parsed = askV2RequestSchema.safeParse(input);
  if (!parsed.success) {
    emitV2Trace({ resultKind: "unsupported" });
    return {
      disposition: "unsupported",
      reason: "not_financial",
      text: "LedgerAI could not read that request — try rephrasing it.",
      conversationId: null,
    };
  }

  const { proposal, conversationId } = parsed.data;
  // Proposal-only surface (no user message): the F-1 provenance gate can never
  // prove a goal_impact delta here, so such proposals clarify (ambiguous_amount)
  // and never execute. No amount from a caller-supplied proposal ever reaches
  // the finance engine without proven provenance.
  const decision = askV2PolicyDecision(proposal);

  if (decision.kind === "unsupported") {
    emitV2Trace({ resultKind: "unsupported", policyDisposition: "unsupported" });
    return {
      disposition: "unsupported",
      reason: decision.reason,
      text: unsupportedText(decision.reason),
      conversationId: null,
    };
  }
  if (decision.kind === "clarification") {
    emitV2Trace({ resultKind: "clarification", policyDisposition: "clarified" });
    return {
      disposition: "clarification",
      reason: decision.reason,
      text: clarificationText(decision.reason),
      conversationId: null,
    };
  }

  const executedAt = new Date();
  let outcome: AskV2PlanOutcome;
  try {
    outcome = await executeAskV2Plan(
      {
        prisma: auth.prisma,
        businessId: auth.business.id,
        currency: auth.business.currency,
        now: executedAt,
        traceId,
      },
      decision.plan,
      decision.query,
      decision.toolKeys,
    );
  } catch (error) {
    emitV2Trace({
      resultKind: "execution_error",
      policyDisposition: "executed",
      toolKeys: decision.toolKeys,
    });
    throw error;
  }

  if (outcome.kind === "unsupported") {
    emitV2Trace({
      resultKind: "unsupported",
      policyDisposition: "executed",
      toolKeys: decision.toolKeys,
    });
    return {
      disposition: "unsupported",
      reason: outcome.reason,
      text: unsupportedText(outcome.reason),
      conversationId: null,
    };
  }
  if (outcome.kind === "clarification") {
    emitV2Trace({
      resultKind: "clarification",
      policyDisposition: "executed",
      toolKeys: decision.toolKeys,
    });
    return {
      disposition: "clarification",
      reason: outcome.reason,
      text: clarificationText(outcome.reason),
      conversationId: null,
    };
  }

  try {
    const persisted = await persistAssistantExchange(
      auth.prisma,
      auth.business.id,
      conversationId ?? null,
      conversationTitle(outcome.query),
      JSON.stringify(proposal),
      outcome.answer.text,
      buildAskV2Anchor({
        query: outcome.query,
        metrics: outcome.metrics,
        toolKeys: outcome.toolKeys,
        verifiedAt: executedAt,
      }),
    );
    emitV2Trace({
      resultKind: "answer",
      policyDisposition: "executed",
      toolKeys: outcome.toolKeys,
    });
    return askV2ResponseSchema.parse({
      disposition: "answer",
      text: outcome.answer.text,
      conversationId: persisted.conversationId,
    });
  } catch (error) {
    if (error instanceof ConversationNotFoundError) {
      emitV2Trace({ resultKind: "unsupported" });
      return {
        disposition: "unsupported",
        reason: "not_supported",
        text: "That conversation is no longer available. Starting a fresh one.",
        conversationId: null,
      };
    }
    emitV2Trace({
      resultKind: "execution_error",
      policyDisposition: "executed",
      toolKeys: outcome.toolKeys,
    });
    throw error;
  }
}