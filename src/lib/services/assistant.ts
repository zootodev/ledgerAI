// ============================================================
// LedgerAI — Ask LedgerAI Service (Semantic Layer)
// ------------------------------------------------------------
// Orchestrates the trusted pipeline:
//   subtle question -> semantic understanding (deterministic, then an
//   OPTIONAL configured provider) -> validated structured intent ->
//   tenant-scoped data collection -> verified engine computation ->
//   professional narration -> persistence.
//
// Security invariants held here:
//   - businessId always comes from requireAuthContext(), never the client,
//     the question, the conversation, or any AI output;
//   - providers get way in, no data out — never DB handles, credentials,
//     business ids, or raw transactions;
//   - clarification / out-of-scope answers short-circuit BEFORE auth/DB;
//   - follow-up context is a single bounded, ownership-checked read.
// ============================================================

import { requireAuthContext } from "@/lib/services/auth-context";
import { zErrorMessage } from "@/lib/validation/index";
import { z } from "zod";
import {
  answerFromMetrics,
  classifyAssistantQuestion,
  classifyFollowUp,
  conversationTitle,
  queryFromSemantic,
  clarificationText,
  UNSUPPORTED_ANSWER,
  type AssistantMetrics,
  type AssistantQuery,
  type QuestionClassification,
} from "@/lib/finance/assistant";
import {
  buildContextFrame,
  resolveAgainstFrames,
  type FinancialContextFrame,
  type FrameResolution,
} from "@/lib/finance/context-frame";
import type { FollowUpAnalysis } from "@/lib/ask/understanding";
import { getAIService } from "@/lib/ai/provider";
import {
  getAskAi,
  type AskAiRuntime,
} from "@/lib/ai/ask-provider";
import { maybeShadowTelemetry } from "@/lib/ai/ask-shadow";
import {
  understandingOutputSchema,
  type UnderstandingOutput,
} from "@/lib/ai/understanding";
import {
  findLastUserQuestionForContext,
  findRecentOwnedExchanges,
  persistAssistantExchange,
} from "@/lib/services/assistant-conversations";
import {
  computeMetricsFor,
  executePlan,
} from "@/lib/finance/tools/executor";
import {
  buildInterpreterSurface,
  resolveInterpretationContext,
} from "@/lib/ask/context-resolver";
import { compileExecutionPlan } from "@/lib/ask/compiler";
import {
  buildInterpreterMessages,
} from "@/lib/ask/prompts/interpreter";
import {
  buildNarrationPayload,
} from "@/lib/ask/prompts/narration";
import {
  narrationPlanSchema,
  interpretationSchema,
} from "@/lib/ask/contracts";
import { evaluateInterpretationPolicy } from "@/lib/ask/policy";
import { buildFactManifest } from "@/lib/finance/facts";
import { renderWithNarrationPlan } from "@/lib/finance/renderer";
import { createAskTrace, emitAskTrace, newTraceId } from "@/lib/observability/ask-trace";
import type { AssistantAnswerDto } from "@/lib/types/assistant";
import type { PrismaClient } from "@/generated/prisma/client";

const assistantQuestionSchema = z
  .string()
  .trim()
  .min(2, "Ask a longer question.")
  .max(500, "Try a shorter question (max 500 characters).");

/** Answer a natural-language question from verified, tenant-scoped data. */
export async function getAssistantAnswer(
  question: string,
  now: Date = new Date(),
): Promise<AssistantAnswerDto> {
  const parsed = assistantQuestionSchema.safeParse(question);
  if (!parsed.success) throw new Error(zErrorMessage(parsed.error));

  const classification = await resolveClassification(parsed.data, now);
  if (classification.kind === "clarification") {
    return { kind: "unsupported", text: clarificationText(classification.reason) };
  }
  if (classification.kind === "unsupported") {
    return { kind: "unsupported", text: UNSUPPORTED_ANSWER };
  }

  const ai = getAskAi();
  const { prisma, business } = await requireAuthContext();
  return composeAnswer(prisma, business, classification.query, parsed.data, now, ai);
}

export interface AskOutcome {
  kind: "answer" | "insufficient" | "unsupported" | "clarification";
  text: string;
  /** Null when the question was unsupported (never persisted). */
  conversationId: string | null;
  userMessageId?: string;
  assistantMessageId?: string;
}

/**
 * Persistent variant of getAssistantAnswer. Answers identically, then stores
 * the exchange in the current business's conversation (creating or continuing
 * it). A period-only conversational follow-up ("What about last month?") is
 * resolved against the previous turn's own, tenant-scoped question before any
 * classification happens — and only ever within an ownership-checked context.
 * Unsupported questions short-circuit BEFORE any auth/DB work and are not
 * persisted.
 */
export async function askAssistantQuestion(
  question: string,
  conversationId: string | null = null,
  now: Date = new Date(),
): Promise<AskOutcome> {
  const parsed = assistantQuestionSchema.safeParse(question);
  if (!parsed.success) throw new Error(zErrorMessage(parsed.error));

  const ai = getAskAi();
  const traceId = newTraceId();

  // A follow-up is only meaningful while continuing an existing conversation.
  // Follow-up classification stays authoritative-deterministic ALWAYS
  // (spec §12) — the canary interpreter never touches this path.
  const followUp = conversationId ? classifyFollowUp(parsed.data, now) : null;

  if (followUp && followUp.kind !== "none" && conversationId) {
    const context = await requireAuthContext();

    // Re-derive the conversation's OWN bounded context as frames and resolve
    // the fragment structurally, ranking explicit amount matches over
    // semantic / continuity / recency evidence. Savings "Both"/"The two" has
    // its own resolution that composes both readings below.
    const frames = await loadContextFrames(
      context.prisma,
      context.business.id,
      conversationId,
      now,
      followUp.kind === "expenseBreakdown" || followUp.kind === "amountConfirmation",
    );
    const resolution = resolveAgainstFrames(parsed.data, followUp, frames, now);

    if (resolution.kind === "resolved") {
      const outcome = await answerAndPersist(
        context.prisma,
        context.business,
        resolution.query,
        parsed.data,
        conversationId,
        now,
        ai,
      );
      debugFollowUp(parsed.data, followUp, frames, resolution, outcome);
      return outcome;
    }
    if (resolution.kind === "savingsSelection") {
      const outcome = await answerSavingsBothReadings(
        context.prisma,
        context.business.id,
        parsed.data,
        conversationId,
        resolution.period,
        now,
      );
      debugFollowUp(parsed.data, followUp, frames, resolution, outcome);
      return outcome;
    }
    if (resolution.kind === "ambiguousAmount") {
      // The cited figure matches owned spending totals in MORE THAN ONE period:
      // honest clarification beats guessing a period for the breakdown.
      debugFollowUp(parsed.data, followUp, frames, resolution, null);
      return persistClarification(
        { kind: "clarification", reason: "ambiguous_amount" },
        parsed.data,
        conversationId,
      );
    }
    // No owned context to resolve against: fall through to normal
    // classification (the reference turn is almost certainly unsupported).
  }

  const classification = await resolveClassification(parsed.data, now);

  // SHADOW mode: deterministic answer stands; the interpreter runs as
  // off-path telemetry on a sample so we can measure would-be canary hits.
  if (ai.config.mode === "shadow" && ai.config.interpreterEnabled) {
    maybeShadowTelemetry({
      ai,
      question: parsed.data,
      classification,
      traceId,
      now,
      loadFrames: async () => {
        if (!conversationId) return [];
        const context = await requireAuthContext();
        return loadContextFrames(
          context.prisma,
          context.business.id,
          conversationId,
          now,
          false,
        );
      },
    });
  }

  // CANARY mode: only where the deterministic classifier stays undecided
  // (clarification/unsupported) may a confident interpreter unlock a real
  // answer — never above an authoritative deterministic query.
  if (ai.config.mode === "canary" && ai.config.interpreterEnabled) {
    if (classification.kind !== "query") {
      const { prisma, business } = await requireAuthContext();
      const frames = conversationId
        ? await loadContextFrames(prisma, business.id, conversationId, now, false)
        : [];
      const canary = await tryCanaryInterpretation(
        prisma,
        business,
        parsed.data,
        conversationId,
        frames,
        now,
        ai,
        traceId,
      );
      if (canary) return canary;
    }
  }

  if (classification.kind === "clarification") {
    return persistClarification(classification, parsed.data, conversationId);
  }
  if (classification.kind === "unsupported") {
    return { kind: "unsupported", text: UNSUPPORTED_ANSWER, conversationId: null };
  }
  const query = classification.query;

  const { prisma, business } = await requireAuthContext();
  return answerAndPersist(prisma, business, query, parsed.data, conversationId, now, ai);
}

async function answerAndPersist(
  prisma: PrismaClient,
  business: { id: string; currency: string },
  query: AssistantQuery,
  parsedQuestion: string,
  conversationId: string | null,
  now: Date,
  ai?: AskAiRuntime,
): Promise<AskOutcome> {
  const answer = await composeAnswer(prisma, business, query, parsedQuestion, now, ai);

  const persisted = await persistAssistantExchange(
    prisma,
    business.id,
    conversationId,
    conversationTitle(query),
    parsedQuestion,
    answer.text,
  );

  return {
    kind: answer.kind,
    text: answer.text,
    conversationId: persisted.conversationId,
    userMessageId: persisted.userMessageId,
    assistantMessageId: persisted.assistantMessageId,
  };
}

/**
 * Persist a clarification as a non-answer exchange (question → clarification
 * text) and return it. Out-of-scope and unsupported results stay transient.
 */
async function persistClarification(
  classification: Extract<QuestionClassification, { kind: "clarification" }>,
  parsedQuestion: string,
  conversationId: string | null,
): Promise<AskOutcome> {
  const text = clarificationText(classification.reason);
  // Out-of-scope / unsupported answers remain transient as currently designed —
  // only meaningful clarifications (ambiguous_savings, ambiguous_amount,
  // needs_subject) are persisted so they participate in conversation context.
  if (
    classification.reason !== "ambiguous_savings" &&
    classification.reason !== "ambiguous_amount" &&
    classification.reason !== "needs_subject"
  ) {
    return { kind: "unsupported", text, conversationId: null };
  }
  const context = await requireAuthContext();
  const persisted = await persistAssistantExchange(
    context.prisma,
    context.business.id,
    conversationId,
    classification.reason === "ambiguous_savings"
      ? "Savings clarification"
      : classification.reason === "ambiguous_amount"
        ? "Amount clarification"
        : "Clarification",
    parsedQuestion,
    text,
  );
  return {
    kind: "clarification",
    text,
    conversationId: persisted.conversationId,
    userMessageId: persisted.userMessageId,
    assistantMessageId: persisted.assistantMessageId,
  };
}

/**
 * Attempt a canary interpreter interpretation for an undecided deterministic
 * classification (clarification/unsupported). Returns the persisted AskOutcome
 * only when the interpreter produces a valid, policy-approved query that
 * compiles and executes cleanly; otherwise null (caller falls back to the
 * deterministic clarification/unsupported text).
 */
async function tryCanaryInterpretation(
  prisma: PrismaClient,
  business: { id: string; currency: string },
  parsedQuestion: string,
  conversationId: string | null,
  frames: FinancialContextFrame[],
  now: Date,
  ai: AskAiRuntime,
  traceId: string,
): Promise<AskOutcome | null> {
  if (!ai.providers.interpreter.configured) return null;
  if (ai.config.mode !== "canary") return null;
  try {
    const surface = buildInterpreterSurface(frames);
    const messages = buildInterpreterMessages({
      now,
      question: parsedQuestion,
      surface,
    });
    const raw = await ai.providers.interpreter.interpret(messages, {
      signal: AbortSignal.timeout(8000),
    });
    const parsed = interpretationSchema.safeParse(raw);
    if (!parsed.success) return null;
    const interp = parsed.data;
    const decision = evaluateInterpretationPolicy(interp, surface.availableReferenceSlots);
    if (!decision.allowed) return null;
    const resolved = resolveInterpretationContext(interp, parsedQuestion, frames, now);
    if (resolved.kind === "clarify") return null;
    const plan = compileExecutionPlan(resolved.interpretation);
    if (plan.kind !== "answer") return null;
    const outcome = await executePlan(
      { prisma, businessId: business.id, currency: business.currency, now, traceId },
      plan,
    );
    if (outcome.kind !== "answer") return null;
    const text = outcome.answer.text;
    const persisted = await persistAssistantExchange(
      prisma,
      business.id,
      conversationId,
      conversationTitle(plan.query),
      parsedQuestion,
      text,
    );
    emitAskTrace(
      createAskTrace({
        traceId,
        mode: "hybrid",
        deterministicDisposition: "clarification",
        providerAttempted: true,
        providerOutcome: "accepted",
        schemaValid: true,
        policyOutcome: "executed",
        toolKeys: plan.toolKeys,
        contextResolution: "explicit_exact",
        resultKind: "answer",
        promptVersion: "ask-interpreter/v1",
        provider: ai.providers.interpreter.name,
      }),
    );
    return {
      kind: "answer",
      text,
      conversationId: persisted.conversationId,
      userMessageId: persisted.userMessageId,
      assistantMessageId: persisted.assistantMessageId,
    };
  } catch {
    return null;
  }
}

/**
 * Build the bounded set of context frames for the conversation's OWN history.
 * Two ownership-checked reads: the last user question, plus the recent
 * exchanges (which let a follow-up re-anchor an amount that our own
 * clarification sits on top of). Everything is re-derived deterministically
 * from the recorded (question, answer) text — nothing is trusted from the
 * client, AI output, or any unstored state.
 */
async function loadContextFrames(
  prisma: PrismaClient,
  businessId: string,
  conversationId: string,
  now: Date,
  includeRecent: boolean,
): Promise<FinancialContextFrame[]> {
  const lastTurn = await findLastUserQuestionForContext(prisma, businessId, conversationId);
  // Only amount-anchor follow-ups need to walk back past more than the last
  // turn (e.g. re-anchoring a figure that our own clarification sits on top
  // of). Period / prior-period / hypothetical / savings selections resolve
  // from the single last turn, so the recent window stays untouched there.
  const recent = includeRecent
    ? await findRecentOwnedExchanges(prisma, businessId, conversationId)
    : [];

  const frames: FinancialContextFrame[] = [];
  if (lastTurn) {
    frames.push(
      buildContextFrame({
        conversationId,
        businessId,
        question: lastTurn.content,
        answer: lastTurn.answer,
        createdAt: lastTurn.createdAt,
        exchangeIndex: 0,
        now,
      }),
    );
  }
  for (const exchange of recent) {
    // The recent window may already contain the last turn's question; skip
    // the duplicate so no exchange is framed twice.
    if (frames.length > 0 && frames[0].question === exchange.content) continue;
    frames.push(
      buildContextFrame({
        conversationId,
        businessId,
        question: exchange.content,
        answer: exchange.answer,
        createdAt: "",
        exchangeIndex: frames.length,
        now,
      }),
    );
  }
  return frames;
}

/**
 * Optional ASK_DEBUG trace (env `ASK_DEBUG=1`) of a follow-up resolution: a
 * single structured line with NO secrets — no ids, credentials, or raw
 * transaction data; figures are only the amounts our own narration cited.
 */
function debugFollowUp(
  question: string,
  followUp: FollowUpAnalysis,
  frames: FinancialContextFrame[],
  resolution: FrameResolution,
  outcome: AskOutcome | null,
): void {
  if (process.env.ASK_DEBUG !== "1") return;
  const frameSummary = (f: FinancialContextFrame) => ({
    exchangeIndex: f.exchangeIndex,
    classification: f.classification,
    intent: f.query?.intent ?? null,
    period: f.period,
    label: f.resolved?.label ?? null,
    reportedMetric: f.reported.metric,
    reportedAmount: f.reported.total,
  });
  const resolved =
    resolution.kind === "resolved"
      ? {
          intent: resolution.query.intent,
          period: resolution.query.period,
          category: resolution.query.category,
          amount: resolution.query.amountReference?.value ?? null,
          evidence: resolution.evidence.kind,
          frame: frameSummary(resolution.evidence.frame),
        }
      : null;
  console.error(
    `[ask-debug] ` +
      JSON.stringify({
        currentQuestion: question,
        detectedIntent: followUp.kind,
        contextFrames: frames.map(frameSummary),
        resolutionKind: resolution.kind,
        resolvedQuery: resolved,
        finalResult: outcome
          ? {
              kind: outcome.kind,
              text: outcome.text,
            }
          : null,
      }),
  );
}

/**
 * Compose the two-option savings answer ("Both", "The two") once the frame
 * layer has confirmed an owned "ambiguous savings" clarification right before
 * this turn. Produces two queries collected via ONE shared collectMetrics
 * call (a single summary / priorSummary — never two DB pipelines), combined
 * into a single conversational text, and persisted as one exchange. The two
 * readings are spelled out explicitly: reading 1 is the spending DELTA vs the
 * previous period (a saving claim only when current < prior); reading 2 is
 * money left after expenses (net profit) from the engine's own narration. The
 * engines remain the sole authority for every figure.
 */
async function answerSavingsBothReadings(
  prisma: PrismaClient,
  businessId: string,
  question: string,
  conversationId: string,
  period: AssistantQuery["period"],
  now: Date,
): Promise<AskOutcome> {
  const queries: AssistantQuery[] = [
    { intent: "periodComparison", category: null, target: "expenses", period },
    { intent: "profit", category: null, period },
  ];

  const metrics = await collectMetrics(prisma, businessId, queries[0], now);

  const partA = answerFromMetrics(queries[0], metrics, "NGN", now);
  const partB = answerFromMetrics(queries[1], metrics, "NGN", now);

  let draft: string;
  const aData = partA.data as
    | {
        target?: string;
        current?: number;
        prior?: number;
        priorLabel?: string;
        period?: string;
      }
    | undefined;
  if (
    partA.kind === "answer" &&
    typeof aData?.current === "number" &&
    typeof aData?.prior === "number" &&
    typeof aData?.priorLabel === "string" &&
    typeof aData?.period === "string"
  ) {
    const plain = (value: number) =>
      new Intl.NumberFormat("en-NG", { maximumFractionDigits: 0 }).format(
        Math.round(value),
      );
    const delta = aData.current - aData.prior;
    const comparison =
      delta < 0
        ? `you spent ₦${plain(-delta)} less than in ${aData.priorLabel}`
        : delta > 0
          ? `you spent ₦${plain(delta)} more than in ${aData.priorLabel}`
          : `you spent the same in ${aData.priorLabel} and ${aData.period}`;
    const savingClaim =
      delta < 0
        ? " That is the amount you saved under this reading."
        : delta > 0
          ? " Spending rose, so there is nothing to report as money you spent less."
          : " There was no change to report as money you spent less.";
    draft =
      `You were asking about savings, which has two readings.\n\n` +
      `1) How much lower your expenses were than the previous period: compared to ` +
      `${aData.priorLabel}, ${comparison} (₦${plain(aData.prior)} in ${aData.priorLabel} ` +
      `vs ₦${plain(aData.current)} in ${aData.period}).${savingClaim}\n\n` +
      `2) How much money you had left after expenses: ${partB.text}`;
  } else {
    draft =
      `You were asking about savings, which has two readings.\n\n` +
      partA.text +
      "\n\n" +
      partB.text;
  }

  const ai = getAIService();
  const narrated =
    (await ai.assistant?.answer(question, { draft, question })) ?? "";
  const text = narrated || draft;

  const persisted = await persistAssistantExchange(
    prisma,
    businessId,
    conversationId,
    "Savings — both readings",
    question,
    text,
  );

  return {
    kind: "answer",
    text,
    conversationId: persisted.conversationId,
    userMessageId: persisted.userMessageId,
    assistantMessageId: persisted.assistantMessageId,
  };
}

/**
 * Deterministic classification is authoritative for the data path. When it
 * comes back as clarification or unsupported, an EXPLICITLY configured
 * understanding provider (never the built-in rules engine) may still map a
 * genuinely financial phrasing the semantic layer missed. Its raw output is
 * Zod-validated here and any failure/invalid payload silently falls back to
 * the deterministic result — provider noise is never surfaced to the user,
 * and no financial data is involved in classification.
 */
async function resolveClassification(
  question: string,
  now: Date,
): Promise<QuestionClassification> {
  const deterministic = classifyAssistantQuestion(question, now);
  if (deterministic.kind === "query") return deterministic;

  const understanding = getAIService().understanding;
  if (!understanding?.configured) return deterministic;

  try {
    const parsed = understandingOutputSchema.safeParse(
      await understanding.classify(question, now),
    );
    if (parsed.success) {
      const fromStructured = classificationFromStructured(parsed.data);
      // Provider "unsupported" is treated as "couldn't say either" — keep the
      // deterministic result (typically the identical unsupported kind).
      if (fromStructured.kind !== "unsupported") return fromStructured;
    }
  } catch {
    // Provider errors are silent: keep the deterministic result.
  }
  return deterministic;
}

/** Map already-validated structured output to a classification kind. */
function classificationFromStructured(
  output: UnderstandingOutput,
): QuestionClassification {
  if (output.classification === "clarification") {
    return { kind: "clarification", reason: "ambiguous_financial_metric" };
  }
  if (output.classification === "unsupported") return { kind: "unsupported" };
  const query = queryFromSemantic(output);
  return query ? { kind: "query", query } : { kind: "unsupported" };
}

/** Shared pipeline: aggregate required metrics, answer, then narrate. */
async function composeAnswer(
  prisma: PrismaClient,
  business: { id: string; currency: string },
  query: AssistantQuery,
  parsedQuestion: string,
  now: Date,
  ai?: AskAiRuntime,
): Promise<{ kind: "answer" | "insufficient"; text: string; metrics: AssistantMetrics }> {
  const metrics = await collectMetrics(prisma, business.id, query, now);
  const answer = answerFromMetrics(query, metrics, business.currency, now);
  const defaultText = answer.text;

  // Narration seam #1 (spec §5): when canary narration is enabled, run the
  // fact manifest through the planner and gate the result via validated plan
  // coverage. Any failure falls back to the deterministic draft.
  if (ai?.config.narrationEnabled && ai.providers.narrationPlanner.configured) {
    try {
      const built = buildFactManifest({ query, metrics, currency: business.currency, now });
      if (built) {
        const userPayload = buildNarrationPayload(built.manifest);
        const rawPlan = await ai.providers.narrationPlanner.plan(
          userPayload,
          { signal: AbortSignal.timeout(6000) },
        );
        const plan = narrationPlanSchema.safeParse(rawPlan).success
          ? narrationPlanSchema.parse(rawPlan)
          : null;
        const narrated = renderWithNarrationPlan(defaultText, built.manifest, plan, defaultText);
        if (narrated !== defaultText) {
          return { kind: answer.kind, text: narrated, metrics };
        }
      }
    } catch {
      // Deterministic fallback on any narration seam failure.
    }
  }

  // Narration seam #2 (legacy production seam): passes the verified draft
  // through a configured assistant adapter that may rewrite wording — never
  // the numbers. Deterministic when nothing is configured.
  const legacy = getAIService();
  const text =
    (await legacy.assistant?.answer(parsedQuestion, { draft: defaultText, question: parsedQuestion })) ??
    defaultText;

  return { kind: answer.kind, text: text || defaultText, metrics };
}

/** Fetch exactly the aggregates the parsed intent needs (no over-fetch). */
async function collectMetrics(
  prisma: PrismaClient,
  businessId: string,
  query: AssistantQuery,
  now: Date,
): Promise<AssistantMetrics> {
  return computeMetricsFor(prisma, businessId, query, now);
}