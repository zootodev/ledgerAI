// ============================================================
// LedgerAI — Ask v2 evaluation fixtures (Phase 6)
// ------------------------------------------------------------
// Scenario definitions with explicit interpreter scripts
// (canned LLM outputs) and expected pipeline dispositions.
// Every proposal passes the real production Zod schema.
// ============================================================

import type { AskTurnMessages } from "@/lib/ai/ask-provider";
import type { NarratorMode } from "./harness";

/* ------------------------------------------------------------
 * Types
 * ------------------------------------------------------------ */

export type InterpreterScript = (
  messages: AskTurnMessages,
) => unknown | Promise<unknown>;

export interface TurnFixture {
  message: string;
  script: InterpreterScript;
  narratorMode: NarratorMode;
  expectedDisposition: "answer" | "clarification" | "unsupported";
  expectedContinuity: "new" | "continued" | "none";
  expectedSchemaValid: boolean;
  note?: string;
}

export interface ScenarioFixture {
  id: string;
  title: string;
  turns: TurnFixture[];
}

/* ------------------------------------------------------------
 * Helpers
 * ------------------------------------------------------------ */

function proposal(tool: string, args: Record<string, unknown>): unknown {
  return { kind: "proposal", proposal: { tool, ...args } };
}

function clarification(reason: string): unknown {
  return { kind: "clarification", reason };
}

const THIS_YEAR = { kind: "thisYear" } as const;
const LAST_MONTH = { kind: "lastMonth" } as const;
function month(m: number, y: number) {
  return { kind: "month", month: m, year: y } as const;
}

/* ------------------------------------------------------------
 * Scenario A — Five-turn original sequence
 * Tests: distribution, capability gap (remaining percent),
 * referential follow-up, top category, explicit period reset.
 * ------------------------------------------------------------ */

export const scenarioA: ScenarioFixture = {
  id: "A",
  title: "Five-turn original sequence (distribution + complement + follow-up)",
  turns: [
    {
      message:
        "from the beginning of this year till now, what did i spend most of my money on",
      script: () => proposal("expense_breakdown", { period: THIS_YEAR }),
      narratorMode: "grounded",
      expectedDisposition: "answer",
      expectedContinuity: "new",
      expectedSchemaValid: true,
    },
    {
      message: "what categories made up the remaining percent",
      script: () => proposal("expense_breakdown", { period: THIS_YEAR, scope: "complement" }),
      narratorMode: "grounded",
      expectedDisposition: "answer",
      expectedContinuity: "continued",
      expectedSchemaValid: true,
      note: "Phase 15: the category-remainder question is a complement-scoped expense_breakdown; the trusted layer computes the remainder",
    },
    {
      message: "Where did that money go?",
      script: () => proposal("expense_breakdown", { period: THIS_YEAR }),
      narratorMode: "grounded",
      expectedDisposition: "answer",
      expectedContinuity: "continued",
      expectedSchemaValid: true,
      note: "Referential follow-up anchors to prior period (thisYear) from history",
    },
    {
      message: "Which category did I spend the most on?",
      script: () => proposal("expense_breakdown", { period: THIS_YEAR }),
      narratorMode: "grounded",
      expectedDisposition: "answer",
      expectedContinuity: "continued",
      expectedSchemaValid: true,
    },
    {
      message: "What did I spend last month?",
      script: () => proposal("expense_summary", { period: LAST_MONTH }),
      narratorMode: "grounded",
      expectedDisposition: "answer",
      expectedContinuity: "continued",
      expectedSchemaValid: true,
      note: "Explicit new period resets context",
    },
  ],
};

/* ------------------------------------------------------------
 * Scenario B — Explicit period continuity
 * Tests: period preserved across referential follow-up.
 * ------------------------------------------------------------ */

export const scenarioB: ScenarioFixture = {
  id: "B",
  title: "Explicit period continuity (July)",
  turns: [
    {
      message: "What did I spend in July?",
      script: () => proposal("expense_summary", { period: month(6, 2026) }),
      narratorMode: "grounded",
      expectedDisposition: "answer",
      expectedContinuity: "new",
      expectedSchemaValid: true,
    },
    {
      message: "What was that spent on?",
      script: () =>
        proposal("expense_breakdown", { period: month(6, 2026) }),
      narratorMode: "grounded",
      expectedDisposition: "answer",
      expectedContinuity: "continued",
      expectedSchemaValid: true,
      note: "Referential follow-up preserves period from history (July 2026)",
    },
  ],
};

/* ------------------------------------------------------------
 * Scenario C — Period change
 * Tests: referential follow-up uses the NEWEST period,
 * not the older one from earlier in the conversation.
 * ------------------------------------------------------------ */

export const scenarioC: ScenarioFixture = {
  id: "C",
  title: "Period change (June → July → referential)",
  turns: [
    {
      message: "What did I spend in June?",
      script: () => proposal("expense_summary", { period: month(5, 2026) }),
      narratorMode: "grounded",
      expectedDisposition: "answer",
      expectedContinuity: "new",
      expectedSchemaValid: true,
    },
    {
      message: "What did I spend in July?",
      script: () => proposal("expense_summary", { period: month(6, 2026) }),
      narratorMode: "grounded",
      expectedDisposition: "answer",
      expectedContinuity: "continued",
      expectedSchemaValid: true,
    },
    {
      message: "What was that spent on?",
      script: () =>
        proposal("expense_breakdown", { period: month(6, 2026) }),
      narratorMode: "grounded",
      expectedDisposition: "answer",
      expectedContinuity: "continued",
      expectedSchemaValid: true,
      note: "Referential follow-up uses NEWEST period (July), not June",
    },
  ],
};

/* ------------------------------------------------------------
 * Scenario D — Category follow-up
 * Tests: top category identification via breakdown distribution.
 * ------------------------------------------------------------ */

export const scenarioD: ScenarioFixture = {
  id: "D",
  title: "Category follow-up (distribution → top category)",
  turns: [
    {
      message: "Show my spending by category",
      script: () => proposal("expense_breakdown", { period: THIS_YEAR }),
      narratorMode: "grounded",
      expectedDisposition: "answer",
      expectedContinuity: "new",
      expectedSchemaValid: true,
    },
    {
      message: "Which category did I spend the most on?",
      script: () => proposal("expense_breakdown", { period: THIS_YEAR }),
      narratorMode: "grounded",
      expectedDisposition: "answer",
      expectedContinuity: "continued",
      expectedSchemaValid: true,
      note: "Top category from distribution matches the highest category total",
    },
  ],
};

/* ------------------------------------------------------------
 * Scenario E — Clarification persistence
 * Tests: clarification turns are NOT persisted, so
 * referential follow-ups after a clarification have no
 * grounding context. Documents the context/state-layer
 * behavior: clarification-only conversations never create
 * a persisted anchor.
 * ------------------------------------------------------------ */

export const scenarioE: ScenarioFixture = {
  id: "E",
  title: "Clarification persistence (context loss)",
  turns: [
    {
      message: "how are things going",
      script: () => clarification("ambiguous_financial_metric"),
      narratorMode: "grounded",
      expectedDisposition: "clarification",
      expectedContinuity: "none",
      expectedSchemaValid: true,
    },
    {
      message: "both of them",
      script: () => clarification("needs_subject"),
      narratorMode: "grounded",
      expectedDisposition: "clarification",
      expectedContinuity: "none",
      expectedSchemaValid: true,
      note: "Clarification not persisted → history empty → referential 'both' unresolvable",
    },
  ],
};

/* ------------------------------------------------------------
 * Scenario F — Conversation isolation
 * Tests: two conversations in the same tenant have
 * independent histories and don't leak context.
 * ------------------------------------------------------------ */

export const scenarioF: ScenarioFixture = {
  id: "F",
  title: "Conversation isolation (same tenant, independent histories)",
  turns: [
    {
      message: "What did I spend in June?",
      script: () => proposal("expense_summary", { period: month(5, 2026) }),
      narratorMode: "grounded",
      expectedDisposition: "answer",
      expectedContinuity: "new",
      expectedSchemaValid: true,
    },
  ],
};

/* A second conversation with a different period. */
export const scenarioFConvo2: TurnFixture = {
  message: "What did I spend in July?",
  script: () => proposal("expense_summary", { period: month(6, 2026) }),
  narratorMode: "grounded",
  expectedDisposition: "answer",
  expectedContinuity: "new",
  expectedSchemaValid: true,
};

/* A follow-up in convo2 referencing convo2's own history. */
export const scenarioFConvo2FollowUp: TurnFixture = {
  message: "What was that spent on?",
  script: () => proposal("expense_breakdown", { period: month(6, 2026) }),
  narratorMode: "grounded",
  expectedDisposition: "answer",
  expectedContinuity: "continued",
  expectedSchemaValid: true,
};

/* ------------------------------------------------------------
 * Scenario G — Tenant isolation (multi-tenant)
 * Tests: businessId-scoped queries, ownership check,
 * cross-business isolation. Creates a temporary second
 * business under the demo user, runs queries, cleans up.
 * ------------------------------------------------------------ */

export const scenarioG: ScenarioFixture = {
  id: "G",
  title: "Tenant isolation (multi-tenant businessId scoping)",
  turns: [
    {
      message: "What did I spend last month?",
      script: () => proposal("expense_summary", { period: LAST_MONTH }),
      narratorMode: "grounded",
      expectedDisposition: "answer",
      expectedContinuity: "new",
      expectedSchemaValid: true,
      note: "Query scoped to temp business only (single known transaction)",
    },
  ],
};

/* ------------------------------------------------------------
 * Scenario H — Golden transcript (Phase 9B expected decisions)
 * Covers the exact real five-turn transcript with the CORRECT
 * structured decisions. The scripts are CANNED proposals — this is a
 * deterministic expected-decision oracle, NOT a model measurement.
 * The companion oracle in evals.test.ts asserts the proposal boundary
 * and rejects: transactions for T3, clarification for T4, omitted
 * category for T2, and expense_breakdown for T5.
 * ------------------------------------------------------------ */

export const scenarioH: ScenarioFixture = {
  id: "H",
  title: "Golden transcript (Phase 9B expected decisions)",
  turns: [
    {
      message:
        "from the beginning of this year till now, what did i spend most of my money on",
      script: () => proposal("expense_breakdown", { period: THIS_YEAR }),
      narratorMode: "grounded",
      expectedDisposition: "answer",
      expectedContinuity: "new",
      expectedSchemaValid: true,
    },
    {
      message: "what was that spent on?",
      script: () =>
        proposal("expense_breakdown", {
          period: THIS_YEAR,
          category: "Inventory",
          categoryOrigin: "referenced",
        }),
      narratorMode: "grounded",
      expectedDisposition: "answer",
      expectedContinuity: "continued",
      expectedSchemaValid: true,
      note: "Phase 9E: T2 referenced category must resolve to categorySpend from the VERIFIED anchor written by T1 (narration re-reading is fallback only)",
    },
    {
      message: "where did that money go?",
      script: () => proposal("expense_breakdown", { period: THIS_YEAR }),
      narratorMode: "grounded",
      expectedDisposition: "answer",
      expectedContinuity: "continued",
      expectedSchemaValid: true,
      note: "Phase 9B: T3 must be expense_breakdown, never transactions",
    },
    {
      message: "which category did i spend the most on?",
      script: () => proposal("expense_breakdown", { period: THIS_YEAR }),
      narratorMode: "grounded",
      expectedDisposition: "answer",
      expectedContinuity: "continued",
      expectedSchemaValid: true,
      note: "Phase 9B: T4 must be expense_breakdown, never clarification",
    },
    {
      message: "what did i spend last month?",
      script: () => proposal("expense_summary", { period: LAST_MONTH }),
      narratorMode: "grounded",
      expectedDisposition: "answer",
      expectedContinuity: "continued",
      expectedSchemaValid: true,
      note: "Phase 9B: T5 must be expense_summary, never expense_breakdown",
    },
  ],
};

/* ------------------------------------------------------------
 * Scenario I — Phase 15 category-complement golden transcript
 * The five follow-ups the user recorded. T2 (aggregate remainder), T3
 * ("other categories" aggregate), T4 ("apart from rent" excluding) and T5
 * (re-ask) must ALL resolve through the trusted finance layer. The canned
 * scripts still replace the model, but the POLICY decision they feed proves
 * the exact structured/complement path each recorded continuation takes.
 * ------------------------------------------------------------ */

export const scenarioI: ScenarioFixture = {
  id: "I",
  title: "Phase 15 category-complement golden transcript",
  turns: [
    {
      message:
        "from the beginning of this year till now, what did i spend most of my money on",
      script: () => proposal("expense_breakdown", { period: THIS_YEAR }),
      narratorMode: "grounded",
      expectedDisposition: "answer",
      expectedContinuity: "new",
      expectedSchemaValid: true,
    },
    {
      message: "what categories made up the remaining percent",
      script: () => proposal("expense_breakdown", { period: THIS_YEAR, scope: "complement" }),
      narratorMode: "grounded",
      expectedDisposition: "answer",
      expectedContinuity: "continued",
      expectedSchemaValid: true,
      note: "A majority in the aggregate remainder — trusted layer derives the slice(5) complement",
    },
    {
      message: "what percent of my money did i spend on other categories",
      script: () => proposal("expense_breakdown", { period: THIS_YEAR, scope: "complement" }),
      narratorMode: "grounded",
      expectedDisposition: "answer",
      expectedContinuity: "continued",
      expectedSchemaValid: true,
      note: "'other categories' = complement (aggregate) — never the literal category Other",
    },
    {
      message: "what did i spend on the remaining categories apart from rent",
      script: () =>
        proposal("expense_breakdown", {
          period: THIS_YEAR,
          category: "Rent",
          categoryOrigin: "referenced",
          scope: "complement",
        }),
      narratorMode: "grounded",
      expectedDisposition: "answer",
      expectedContinuity: "continued",
      expectedSchemaValid: true,
      note: "Excluding complement resolves 'rent' against the verified anchor category set",
    },
    {
      message: "what did i spend on the remaining categories",
      script: () => proposal("expense_breakdown", { period: THIS_YEAR, scope: "complement" }),
      narratorMode: "grounded",
      expectedDisposition: "answer",
      expectedContinuity: "continued",
      expectedSchemaValid: true,
      note: "Confirmed the whole remainder once more",
    },
  ],
};

/* ------------------------------------------------------------
 * Scenario J — literal category Other regression (Phase 15 sub-goal)
 * A provider-marked explicit category "Other" must be answered as a normal
 * category spend — NOT coerced into the complement path. The named "other
 * categories" (plural) follow-up shifts to complement only on the SECOND
 * turn where the interpreter itself marks the scope.
 * ------------------------------------------------------------ */

export const scenarioJ: ScenarioFixture = {
  id: "J",
  title: "Literal category Other stays a normal category",
  turns: [
    {
      message: "what did i spend on other",
      script: () =>
        proposal("expense_breakdown", { period: THIS_YEAR, category: "Other", categoryOrigin: "explicit" }),
      narratorMode: "grounded",
      expectedDisposition: "answer",
      expectedContinuity: "new",
      expectedSchemaValid: true,
      note: "A provider-marked explicit 'Other' is a category, not the remainder",
    },
    {
      message: "and what did i spend on the other categories",
      script: () => proposal("expense_breakdown", { period: THIS_YEAR, scope: "complement" }),
      narratorMode: "grounded",
      expectedDisposition: "clarification",
      expectedContinuity: "none",
      expectedSchemaValid: true,
      note: "No distribution was ever shown in THIS conversation (only a categorySpend for Other), so the complement cannot be grounded in any shown aggregate — the honest answer is clarification, never 'last category wins'",
    },
  ],
};

/* ------------------------------------------------------------
 * Scenario K — Phase 17 category share golden transcript
 * T1 opens with a FRESH explicit share ("what percentage did inventory make
 * up?") -> category_share explicit. T2 resolves a referenced category against
 * T1's verified anchor category set. T3 proves "spend" never becomes a share
 * (expense_breakdown referenced = amount). T4 proves the excluding complement
 * still resolves against a share-established category set. T5 proves a
 * literal "other" share stays a category, never the remainder.
 * ------------------------------------------------------------ */

export const scenarioK: ScenarioFixture = {
  id: "K",
  title: "Phase 17 category share (fresh + referenced + amount/split regression)",
  turns: [
    {
      message: "what percentage did inventory make up",
      script: () =>
        proposal("category_share", { period: THIS_YEAR, category: "Inventory", categoryOrigin: "explicit" }),
      narratorMode: "grounded",
      expectedDisposition: "answer",
      expectedContinuity: "new",
      expectedSchemaValid: true,
      note: "The first question after a fresh start is an EXPLICIT share of this year's spending",
    },
    {
      message: "what about rent",
      script: () =>
        proposal("category_share", { period: THIS_YEAR, category: "Rent", categoryOrigin: "referenced" }),
      narratorMode: "grounded",
      expectedDisposition: "answer",
      expectedContinuity: "continued",
      expectedSchemaValid: true,
      note: "A referenced share resolves 'rent' against T1's VERIFIED anchor category set — never against the user's bare claim",
    },
    {
      message: "what did i spend on inventory",
      script: () =>
        proposal("expense_breakdown", { period: THIS_YEAR, category: "Inventory", categoryOrigin: "referenced" }),
      narratorMode: "grounded",
      expectedDisposition: "answer",
      expectedContinuity: "continued",
      expectedSchemaValid: true,
      note: "An AMOUNT question is expense_breakdown -> categorySpend (a trusted figure), NEVER a category_share",
    },
    {
      message: "what did i spend on the remaining categories apart from rent",
      script: () =>
        proposal("expense_breakdown", {
          period: THIS_YEAR,
          category: "Rent",
          categoryOrigin: "referenced",
          scope: "complement",
        }),
      narratorMode: "grounded",
      expectedDisposition: "answer",
      expectedContinuity: "continued",
      expectedSchemaValid: true,
      note: "Excluding complement resolves 'rent' against the share-established verified category set",
    },
    {
      message: "what percentage did other make up",
      script: () =>
        proposal("category_share", { period: THIS_YEAR, category: "Other", categoryOrigin: "explicit" }),
      narratorMode: "grounded",
      expectedDisposition: "answer",
      expectedContinuity: "continued",
      expectedSchemaValid: true,
      note: "A literal 'other' SHARE stays a category share (its own small verified percent), not the remainder",
    },
  ],
};
