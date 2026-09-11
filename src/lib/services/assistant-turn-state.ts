// ============================================================
// LedgerAI — AssistantTurnState seam (spec Stage 6)
// ------------------------------------------------------------
// A V2 structured turn-state model (schemaVersion 2, §6) derived from
// the OWN exchange's deterministic re-reading plus the verified fact
// manifest. The spec GAITS the `AssistantTurnState` Prisma model:
// "only after existing Phase 8B work is independently accepted".
// Consequently:
//   - derivation is always possible (pure, redacted, deterministic);
//   - persistence is a seam behind ASK_STRUCTURED_STATE_WRITE (default
//     off) whose DB adapter is intentionally a stub today — enabling the
//     flag without a migration is a no-op with a logged marker.
// ============================================================

import { createAskTrace, emitAskTrace } from "@/lib/observability/ask-trace";
import { deriveContextFrameV2 } from "@/lib/ask/context-resolver";
import type { ContextFrameV2, FinancialFact } from "@/lib/ask/contracts";
import type { FinancialContextFrame } from "@/lib/finance/context-frame";

export interface TurnStateInput {
  turnOrdinal: number;
  frames: FinancialContextFrame[];
  facts: FinancialFact[];
  moneyFactId: string | null;
  traceId: string;
}

/** Pure derivation of the V2 frame for an owned exchange (no side effects). */
export function deriveTurnStateV2(input: Omit<TurnStateInput, "traceId">): ContextFrameV2 {
  const newest = input.frames[0];
  return deriveContextFrameV2({
    turnOrdinal: input.turnOrdinal,
    frame: newest ?? emptyFrame(),
    facts: input.facts,
    moneyFactId: input.moneyFactId,
  });
}

function emptyFrame(): FinancialContextFrame {
  return {
    conversationId: "",
    businessId: "",
    createdAt: "",
    exchangeIndex: 0,
    question: "",
    answer: null,
    classification: "unsupported",
    clarificationReason: null,
    query: null,
    period: null,
    resolved: null,
    reported: {
      metric: null,
      total: null,
      periodLabel: null,
      categoryName: null,
      categories: [],
    },
  };
}

/**
 * Persist the derived V2 turn state when the feature flag is on. The DB
 * adapter is DEFERRED (spec Stage 6 gating): enabling the flag logs a
 * redacted marker and returns false rather than fabricating persistence.
 */
export async function writeTurnStateIfEnabled(
  enabled: boolean,
  input: Omit<TurnStateInput, "turnOrdinal" | "facts" | "moneyFactId">,
  _frame: ContextFrameV2,
): Promise<boolean> {
  if (!enabled) return false;
  void _frame;
  // DB adapter pending the AssistantTurnState migration (spec §6 gating).
  emitAskTrace(
    createAskTrace({
      traceId: input.traceId,
      mode: "deterministic",
      deterministicDisposition: "unsupported",
      contextResolution: "none",
      resultKind: "answer",
    }),
  );
  return false;
}