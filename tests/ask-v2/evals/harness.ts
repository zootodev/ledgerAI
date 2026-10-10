// ============================================================
// LedgerAI — Ask v2 evaluation harness (Phase 6)
// ------------------------------------------------------------
// Scripted interpreter provider + per-turn runner mirroring
// askV2Ask wiring with injectable AI runtime. No production
// modifications; no secrets in output.
// ============================================================

import type { AskAiRuntime, AskTurnMessages } from "@/lib/ai/ask-provider";
import { ASK_V2_NARRATOR_PROMPT_VERSION } from "@/lib/ask-v2/narrator-prompt";
import { interpretAskV2 } from "@/lib/ask-v2/interpreter";
import { askV2PolicyDecision, askV2PolicyContextFromExchanges } from "@/lib/ask-v2/policy";
import { buildAskV2Anchor, parseAskV2Anchor } from "@/lib/ask-v2/anchor";
import { executeAskV2Plan } from "@/lib/ask-v2/executor";
import { buildFactManifest } from "@/lib/finance/facts";
import { narrateAskV2 } from "@/lib/ask-v2/narrator";
import {
  clarificationText,
  conversationTitle,
  UNSUPPORTED_ANSWER,
} from "@/lib/finance/assistant";
import {
  persistAssistantExchange,
  findRecentOwnedExchanges,
} from "@/lib/services/assistant-conversations";
import type { PrismaClient } from "@/generated/prisma/client";
import type { NarrationManifest } from "@/lib/ask/contracts";
import type { AskV2ConversationMessage } from "@/lib/ask-v2/interpreter";

/* ------------------------------------------------------------
 * Constants
 * ------------------------------------------------------------ */

export const EVAL_NOW = new Date("2026-08-15T12:00:00.000Z");
export const DEMO_EMAIL = "demo@zooto.local";

/* ------------------------------------------------------------
 * Types
 * ------------------------------------------------------------ */

export type NarratorMode = "grounded" | "ungrounded" | "provider_failure";
export type InterpreterScript = (
  messages: AskTurnMessages,
) => unknown | Promise<unknown>;

export interface TurnEvidence {
  scenario: string;
  turn: number;
  message: string;
  conversationIdIn: string | null;
  conversationIdOut: string | null;
  created: boolean;
  continuity: "new" | "continued" | "none";
  historyTurns: number;
  historyPreview: Array<{ role: string; content: string }>;
  interpreterKind: string;
  proposal: unknown;
  schemaValid: boolean;
  policyDisposition: string;
  executorReached: boolean;
  executorKind: string | null;
  executorIntent: string | null;
  executorPeriod: string | null;
  executorTotalExpenses: number | null;
  executorTopCategories: Array<{ name: string; amount: number; share: number }>;
  manifestFacts: number;
  manifestFactSummary: string[];
  moneyFactId: string | null;
  narratorOutcome: string | null;
  grounding: string;
  anchorBuilt: boolean;
  anchorPersistedValid: boolean;
  anchorIntent: string | null;
  anchorPeriodKind: string | null;
  anchorCategory: string | null;
  anchorTopCategory: string | null;
  anchorCategoryCount: number;
  finalResponse: string;
  httpErrors: string[];
  pass: boolean;
  failureLayer: string | null;
  note?: string;
}

export interface ScenarioResult {
  id: string;
  title: string;
  turns: TurnEvidence[];
  pass: boolean;
}

/* ------------------------------------------------------------
 * Masking (safe-to-log output)
 * ------------------------------------------------------------ */

export function mask(text: string): string {
  return text
    .replace(/₦\s?[\d,.]+/g, "⟨amount⟩")
    .replace(/\b\d{1,3}(,\d{3})+(\.\d+)?\b/g, "⟨amount⟩")
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, "⟨date⟩")
    .replace(
      /\b[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\b/g,
      "⟨id⟩",
    );
}

/* ------------------------------------------------------------
 * ScriptedRuntime — fake LLM provider
 * ------------------------------------------------------------ */

export function createScriptedRuntime() {
  let currentScript: InterpreterScript = () => ({
    kind: "clarification",
    reason: "needs_subject",
  });
  let currentNarratorMode: NarratorMode = "grounded";

  function setTurn(
    script: InterpreterScript,
    narratorMode: NarratorMode,
  ): void {
    currentScript = script;
    currentNarratorMode = narratorMode;
  }

  const runtime: AskAiRuntime = {
    config: {
      mode: "canary",
      interpreterEnabled: true,
      narrationEnabled: false,
      structuredStateWrite: false,
      shadowSampleRate: 1,
      askV2Enabled: false,
      askEnabled: false,
    },
    providers: {
      interpreter: {
        name: "eval-fake-provider",
        configured: true,
        model: "fake-model",
        interpret: async (messages: AskTurnMessages) => {
          if (messages.promptVersion === ASK_V2_NARRATOR_PROMPT_VERSION) {
            const payload = JSON.parse(messages.user) as {
              manifest: NarrationManifest;
              deterministicFallback: string;
            };
            switch (currentNarratorMode) {
              case "grounded":
                // Serve the verified deterministic narration so the persisted
                // owned answer stays parseable by the trusted narration readers
                // (the "grounded" invariant: any wording that cannot survive
                // grounding is replaced by the deterministic text).
                return { answer: payload.deterministicFallback };
              case "ungrounded":
                return {
                  answer: "Your spending was ₦9,999,999 last month.",
                };
              case "provider_failure":
                throw new Error("eval simulated upstream failure");
            }
          }
          return currentScript(messages);
        },
      },
      narrationPlanner: {
        name: "deterministic",
        configured: false,
        plan: async () => ({}),
      },
    },
  };

  return { runtime, setTurn };
}

/* ------------------------------------------------------------
 * Turn runner — mirrors askV2Ask wiring
 * ------------------------------------------------------------ */

function unsupportedText(reason: "not_financial" | "not_supported"): string {
  return reason === "not_supported"
    ? "LedgerAI can analyze your income, expenses, profit, balance, transactions, and spending by category — but cannot search raw transaction text in this phase."
    : UNSUPPORTED_ANSWER;
}

function interpretationRunFailure(
  kind:
    | "provider_unavailable"
    | "provider_timeout"
    | "invalid_provider_output",
): string {
  if (kind === "provider_timeout")
    return "The AI assistant took too long to respond. Please try again.";
  if (kind === "provider_unavailable")
    return "The AI assistant isn't available right now. Please try again shortly.";
  return "LedgerAI could not understand that message. Please try again.";
}

export interface TurnContext {
  prisma: PrismaClient;
  businessId: string;
  currency: string;
}

export interface TurnInput {
  scenario: string;
  turn: number;
  message: string;
  conversationId: string | null;
  ctx: TurnContext;
  runtime: ReturnType<typeof createScriptedRuntime>["runtime"];
}

export async function runTurn(input: TurnInput): Promise<TurnEvidence> {
  const { scenario, turn, message, conversationId, ctx, runtime } = input;
  const evidence: TurnEvidence = {
    scenario,
    turn,
    message,
    conversationIdIn: conversationId,
    conversationIdOut: null,
    created: false,
    continuity: "none",
    historyTurns: 0,
    historyPreview: [],
    interpreterKind: "",
    proposal: null,
    schemaValid: false,
    policyDisposition: "",
    executorReached: false,
    executorKind: null,
    executorIntent: null,
    executorPeriod: null,
    executorTotalExpenses: null,
    executorTopCategories: [],
    manifestFacts: 0,
    manifestFactSummary: [],
    moneyFactId: null,
    narratorOutcome: null,
    grounding: "",
    anchorBuilt: false,
    anchorPersistedValid: false,
    anchorIntent: null,
    anchorPeriodKind: null,
    anchorCategory: null,
    anchorTopCategory: null,
    anchorCategoryCount: 0,
    finalResponse: "",
    httpErrors: [],
    pass: false,
    failureLayer: null,
  };

  // 1. Ownership check
  if (conversationId) {
    const owned = await ctx.prisma.assistantConversation.findFirst({
      where: { id: conversationId, businessId: ctx.businessId },
      select: { id: true },
    });
    if (!owned) {
      evidence.interpreterKind = "gone";
      evidence.policyDisposition = "gone";
      evidence.finalResponse =
        "That conversation is no longer available. Starting a fresh one.";
      evidence.pass = true;
      return evidence;
    }
  }

  // 2. Bounded history
  const recentExchanges = conversationId
    ? await findRecentOwnedExchanges(
        ctx.prisma,
        ctx.businessId,
        conversationId,
      )
    : [];
  const history: AskV2ConversationMessage[] = recentExchanges
    .slice()
    .reverse()
    .flatMap(({ content, answer }) => [
      { role: "user" as const, content },
      ...(answer ? [{ role: "assistant" as const, content: answer }] : []),
    ]);
  evidence.historyTurns = history.length;
  evidence.historyPreview = history.map((h) => ({
    role: h.role,
    content: mask(h.content).slice(0, 120),
  }));

  // 3. LLM interpreter
  const interpretation = await interpretAskV2({
    message,
    history,
    now: EVAL_NOW,
    ai: runtime,
  });
  evidence.interpreterKind = interpretation.kind;

  // 4. Schema validation result
  evidence.schemaValid =
    interpretation.kind !== "invalid_provider_output";

  if (interpretation.kind === "success") {
    evidence.proposal = interpretation.proposal;
  }

  // 5. Switch on interpretation
  switch (interpretation.kind) {
    case "clarification": {
      evidence.policyDisposition = "clarification";
      evidence.finalResponse = clarificationText(interpretation.reason);
      evidence.pass = true;
      return evidence;
    }
    case "unsupported": {
      evidence.policyDisposition = "unsupported";
      evidence.finalResponse = unsupportedText(interpretation.reason);
      evidence.pass = true;
      return evidence;
    }
    case "provider_unavailable":
    case "provider_timeout":
    case "invalid_provider_output": {
      evidence.policyDisposition = interpretation.kind;
      evidence.finalResponse = interpretationRunFailure(interpretation.kind);
      evidence.failureLayer = "interpreter";
      evidence.pass = true;
      return evidence;
    }
  }

  // 6. Policy (referenced categories resolve against OWNED verified anchors,
  //    with Phase 9D narration re-reading as the compatibility fallback)
  const decision = askV2PolicyDecision(
    interpretation.proposal,
    askV2PolicyContextFromExchanges(recentExchanges),
  );
  evidence.policyDisposition = decision.kind;

  if (decision.kind !== "answer") {
    evidence.finalResponse =
      decision.kind === "clarification"
        ? clarificationText(decision.reason)
        : unsupportedText("not_supported");
    evidence.pass = true;
    return evidence;
  }

  // 7. Execute
  const outcome = await executeAskV2Plan(
    {
      prisma: ctx.prisma,
      businessId: ctx.businessId,
      currency: ctx.currency,
      now: EVAL_NOW,
      traceId: `eval-${scenario}-${turn}-${Date.now()}`,
    },
    decision.plan,
    decision.query,
    decision.toolKeys,
  );
  evidence.executorReached = true;
  evidence.executorKind = outcome.kind;

  if (outcome.kind !== "answer") {
    evidence.finalResponse =
      outcome.kind === "clarification"
        ? clarificationText(outcome.reason)
        : unsupportedText("not_supported");
    evidence.failureLayer = "executor";
    evidence.pass = true;
    return evidence;
  }

  evidence.executorIntent = outcome.query.intent;
  evidence.executorPeriod = JSON.stringify(outcome.query.period);
  evidence.executorTotalExpenses = outcome.metrics.summary.expenses;
  evidence.executorTopCategories = outcome.metrics.categoryTotals
    .slice(0, 5)
    .map((c) => ({
      name: c.categoryName,
      amount: c.amount,
      share:
        outcome.metrics.summary.expenses > 0
          ? Math.round(
              (c.amount / outcome.metrics.summary.expenses) * 1000,
            ) / 10
          : 0,
    }));

  // 8. Verified turn anchor (Phase 9E) — derived from trusted execution data
  //    BEFORE narration; narrator wording is never an input.
  const anchor = buildAskV2Anchor({
    query: outcome.query,
    metrics: outcome.metrics,
    toolKeys: outcome.toolKeys,
    verifiedAt: EVAL_NOW,
  });
  evidence.anchorBuilt = true;
  evidence.anchorIntent = anchor.intent;
  evidence.anchorPeriodKind = anchor.period?.kind ?? null;
  evidence.anchorCategory = anchor.category;
  evidence.anchorTopCategory = anchor.topCategory;
  evidence.anchorCategoryCount = anchor.categorySet.length;

  // 9. Facts manifest
  let built;
  try {
    built = buildFactManifest({
      query: outcome.query,
      metrics: outcome.metrics,
      currency: ctx.currency,
      now: EVAL_NOW,
    });
  } catch {
    built = null;
  }
  evidence.manifestFacts = built ? built.manifest.facts.length : 0;
  evidence.manifestFactSummary = built
    ? built.manifest.facts.map((f) => `${f.kind}:${f.display}`)
    : [];
  evidence.moneyFactId = built ? built.moneyFactId : null;

  // 9. Narrate
  const deterministicText = outcome.answer.text;
  let finalText = deterministicText;
  if (built) {
    const narrated = await narrateAskV2({
      userMessage: message,
      history,
      manifest: built.manifest,
      deterministicText,
      now: EVAL_NOW,
      ai: runtime,
    });
    evidence.narratorOutcome = narrated.kind;
    evidence.grounding =
      narrated.kind === "answer"
        ? "grounded"
        : `fallback:${narrated.reason}`;
    finalText = narrated.text;
  } else {
    evidence.narratorOutcome = "skipped";
    evidence.grounding = "not-run";
  }
  evidence.finalResponse = finalText;

  // 10. Persist (anchor written atomically with the assistant row), then
  //     verify the metadata round-trips and re-validates.
  try {
    const persisted = await persistAssistantExchange(
      ctx.prisma,
      ctx.businessId,
      conversationId ?? null,
      conversationTitle(outcome.query),
      message,
      finalText,
      anchor,
    );
    const stored = await ctx.prisma.assistantMessage.findFirst({
      where: { id: persisted.assistantMessageId, conversationId: persisted.conversationId },
      select: { metadata: true },
    });
    evidence.anchorPersistedValid = parseAskV2Anchor(stored?.metadata) !== null;
    evidence.conversationIdOut = persisted.conversationId;
    evidence.created = persisted.created;
    evidence.continuity = persisted.created ? "new" : "continued";
    evidence.pass = true;
  } catch {
    evidence.failureLayer = "persistence";
    evidence.pass = false;
  }

  return evidence;
}
