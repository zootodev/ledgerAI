// ============================================================
// LedgerAI — Ask v2 policy boundary (Phase 2 foundation)
// ------------------------------------------------------------
// Decides, in TRUSTED server code, whether a VALIDATED v2 proposal may
// be executed and with which allow-listed canonical tool keys. The LLM
// (future) PROPOSES; this layer DISPOSES.
//
// Rules held here:
//   - the proposal is ALREADY validated by askV2ProposalSchema (semantic
//     arguments only, strict) — tenant context never reaches this layer;
//   - every outcome maps to the canonical deterministic finance engine
//     (AssistantQuery + ExecutionPlan); nothing is model-authoritative;
//   - tool keys are a STATIC capability map — the model can never choose
//     a key, and each key is re-checked against internalToolKeySchema
//     before it is allowed to execute;
//   - `search_transactions` has no deterministic Phase-2 engine path and
//     is an honest typed `unsupported` — never a fabricated result;
//   - `categoryOrigin:"referenced"` proposals are verified against the trusted
//     category set carried by OWNED VERIFIED ANCHORS (Phase 9E
//     `assistant_messages.metadata`, derived from trusted execution data). Rows
//     with no valid anchor fall back to re-reading our OWN deterministic
//     narration (Phase 9D compatibility path). An unresolvable referent
//     clarifies — it is never downgraded to aggregate.
//   - `goal_impact.delta` is a FINANCIAL AMOUNT. It is never trusted because a
//     model (or caller) placed it in a structured field: it must be PROVEN
//     deterministically against the user's own wording (Phase 27B-1 F-1,
//     `verifyGoalImpactDeltaProvenance`). The model may propose the candidate;
//     this layer verifies magnitude and direction are the user's, and a
//     proposal surface that carries NO user message can never execute a
//     goal_impact — it clarifies (ambiguous_amount).
//
// No v1 NLU is recreated here: no phrase tables, keyword detectors,
// intent cascades, or interpretation branches. v2 is LLM-first at the
// contract boundary.
// ============================================================

import {
  type AskV2Proposal,
  type AskV2ToolKeys,
} from "./contracts";
import {
  type AssistantQuery,
} from "@/lib/finance/assistant";
import {
  internalToolKeySchema,
  type ExecutionPlan,
  type InternalToolKey,
} from "@/lib/ask/contracts";
import { readNarration } from "@/lib/finance/context-frame";
import { parseAskV2Anchor } from "./anchor";
import { verifyGoalImpactDeltaProvenance } from "./provenance";

export type AskV2PolicyDecision =
  | {
      kind: "answer";
      query: AssistantQuery;
      plan: ExecutionPlan;
      toolKeys: AskV2ToolKeys;
    }
  | { kind: "clarification"; reason: "ambiguous_financial_metric" | "needs_subject" | "ambiguous_amount" }
  | { kind: "unsupported"; reason: "not_financial" | "not_supported" };

/** Static capability map: v2 tool -> allow-listed canonical internal keys.
 * The model may never influence these (mirrors ask/compiler's map). */
const V2_TOOL_KEYS: Readonly<Record<string, readonly InternalToolKey[]>> = {
  expense_summary: ["summary.get"],
  expense_breakdown: ["summary.get", "categories.listSpending", "categories.distribution"],
  expense_comparison: ["period.compare"],
  category_ranking: ["summary.get", "categories.listSpending", "categories.distribution"],
  balance: ["balance.get"],
  transactions: ["summary.get", "transactions.count"],
  goal_impact: ["summary.get", "categories.listSpending"],
  category_share: ["summary.get", "categories.listSpending", "categories.distribution"],
};

/** Narrative intents whose OWN deterministic answers establish a categoryName. */
const CATEGORY_NAME_INTENTS = [
  "topCategory",
  "lowestCategory",
  "categorySpend",
] as const;

/** Phase 15 — anchored intents that establish a verified category-distribution
 * context ("the remaining categories" has a referent). An anchor on one of
 * these carries the full verified category set of the period (distribution /
 * ranking / top-category answers are all built from the ranked category
 * totals). */
const DISTRIBUTION_CONTEXT_INTENTS: ReadonlySet<string> = new Set([
  "spendingDistribution",
  "expenseBreakdown",
  "topCategory",
]);

/** Our OWN deterministic distribution template: "{label} your spending broke down as …". */
const DISTRIBUTION_LABEL = /in ([^()]+?) your spending broke down as/i;

/** One per-category item from OUR distribution narration: "Name (NN%)". */
const DISTRIBUTION_ITEM = /([a-z][a-z0-9 &'.-]*?)\s*\(\d[\d,.]*%\)/gi;

export interface AskV2PolicyContext {
  /** Trusted categories established by OWNED prior exchanges (canonical casing). */
  categorySet: ReadonlySet<string>;
  /**
   * Phase 15 — whether an OWNED prior exchange established a category
   * DISTRIBUTION context ("your spending broke down as …") that a scoped
   * complement ("the remaining categories") can be answered against. Absent
   * means a category-less complement request has no verified referent and must
   * clarify — never "last category wins", never a guessed aggregate.
   */
  hasDistributionContext?: boolean;
}

/** Default context: no owned history means no referenced category can resolve. */
const NO_OWNED_CONTEXT: AskV2PolicyContext = {
  categorySet: new Set(),
  hasDistributionContext: false,
};

/**
 * Deterministically recover category names OUR OWN persisted narration
 * established, re-read from the answer text via the trusted narration readers
 * (never the user's words):
 *   - topCategory / lowestCategory / categorySpend answers carry a categoryName;
 *   - a spendingDistribution answer names its categories in "Name (NN%)" items.
 * The distribution reader's raw first capture absorbs the "In {label} your
 * spending broke down as" prefix as one bogus name, so distribution items are
 * re-scanned from the tail after the label. This is fixed-template matching of
 * OUR OWN deterministic output — no NLU, no structured persistence.
 */
function ownedCategoryNames(answer: string): string[] {
  const names: string[] = [];
  for (const intent of CATEGORY_NAME_INTENTS) {
    const figures = readNarration(answer, intent);
    if (figures.categoryName) names.push(figures.categoryName.trim());
  }
  const labelMatch = DISTRIBUTION_LABEL.exec(answer);
  if (labelMatch) {
    const tail = answer.slice(labelMatch.index + labelMatch[0].length);
    for (const m of tail.matchAll(DISTRIBUTION_ITEM)) {
      names.push(m[1].trim().replace(/^and\s+/i, "").trim());
    }
  }
  return names.filter(Boolean);
}

export function ownedCategorySet(
  exchanges: ReadonlyArray<{ content: string; answer: string | null }>,
): ReadonlySet<string> {
  const set = new Set<string>();
  for (const exchange of exchanges) {
    if (!exchange.answer) continue;
    for (const name of ownedCategoryNames(exchange.answer)) set.add(name);
  }
  return set;
}

/**
 * Build the trusted policy context for a turn from the OWNED exchange window.
 *
 * PREFERRED source (Phase 9E): the strict, verified `AskV2TurnAnchor` persisted
 * on the assistant row — category names come straight from the deterministic
 * engine's verified metrics, so narrator rewording cannot corrupt them.
 *
 * COMPATIBILITY fallback (Phase 9D): a row with no valid anchor (pre-9E history
 * or non-ask-v2 turns) still contributes categories recovered from OUR OWN
 * deterministic narration. Retained this phase; removable later.
 *
 * Phase 15: a distribution context is established by any anchor whose intent is
 * a ranking/distribution answer, OR by our own deterministic distribution
 * narration ("your spending broke down as …"). Without it, a category-less
 * complement request cannot be grounded.
 */
export function askV2PolicyContextFromExchanges(
  exchanges: ReadonlyArray<{ answer: string | null; metadata?: unknown }>,
): AskV2PolicyContext {
  const set = new Set<string>();
  let hasDistributionContext = false;
  for (const exchange of exchanges) {
    const anchor = parseAskV2Anchor(exchange.metadata);
    if (anchor) {
      for (const name of anchor.categorySet) set.add(name);
      if (anchor.intent && DISTRIBUTION_CONTEXT_INTENTS.has(anchor.intent)) {
        hasDistributionContext = true;
      }
      continue;
    }
    if (exchange.answer) {
      for (const name of ownedCategoryNames(exchange.answer)) set.add(name);
      if (DISTRIBUTION_LABEL.test(exchange.answer)) {
        hasDistributionContext = true;
      }
    }
  }
  return { categorySet: set, hasDistributionContext };
}

/**
 * Verify a referenced category against the trusted owned set and canonicalize
 * it (case/format via the set's stored narration form). Returns null when the
 * referent cannot be grounded — the caller must clarify, never guess.
 */
function resolveReferencedCategory(
  category: string,
  categorySet: ReadonlySet<string>,
): string | null {
  const needle = category.trim().toLowerCase();
  if (!needle) return null;
  for (const trusted of categorySet) {
    if (trusted.trim().toLowerCase() === needle) return trusted.trim();
  }
  return null;
}

/** Deterministic policy decision for a VALIDATED proposal.
 *
 *  `userMessage` — the raw user text of the turn (askV2Ask passes it;
 *  proposal-only surfaces like askV2Turn intentionally pass none). It feeds
 *  the F-1 goal_impact provenance gate: an unproven delta is a clarification,
 *  never an execution. */
export function askV2PolicyDecision(
  proposal: AskV2Proposal,
  context: AskV2PolicyContext = NO_OWNED_CONTEXT,
  userMessage?: string,
): AskV2PolicyDecision {
  // No deterministic engine path exists for text search in Phase 2 — refuse
  // honestly rather than inventing a result.
  if (proposal.tool === "search_transactions") {
    return { kind: "unsupported", reason: "not_supported" };
  }

  // F-1 (Phase 27B-1): a goal_impact delta is a financial amount. It must be
  // proven to originate from the user's own words before ANY part of it is
  // turned into an engine query — the model may propose the candidate; only
  // the deterministic provenance validator may authorize it. Failure (or no
  // user message, e.g. the proposal surfaces) clarifies ambiguous_amount and
  // never builds an execution plan.
  if (proposal.tool === "goal_impact") {
    const provenance = verifyGoalImpactDeltaProvenance({
      message: userMessage ?? "",
      delta: proposal.delta,
    });
    if (!provenance.ok) {
      return { kind: "clarification", reason: "ambiguous_amount" };
    }
  }

  const query = queryFromProposal(proposal, context);
  if (!query) {
    return { kind: "clarification", reason: "needs_subject" };
  }

  const rawKeys = V2_TOOL_KEYS[proposal.tool] ?? [];
  const toolKeys = rawKeys
    .filter((key) => internalToolKeySchema.options.includes(key))
    .slice(0, 3);
  if (toolKeys.length === 0) {
    return { kind: "clarification", reason: "ambiguous_financial_metric" };
  }

  const plan: ExecutionPlan = { kind: "answer", query, toolKeys };
  return { kind: "answer", query, plan, toolKeys };
}

/** Map a validated v2 proposal onto the canonical engine query. */
function queryFromProposal(
  proposal: AskV2Proposal,
  context: AskV2PolicyContext,
): AssistantQuery | null {
  switch (proposal.tool) {
    case "expense_summary":
      return { intent: "expenses", category: null, period: proposal.period };
    case "expense_breakdown": {
      // Phase 15 — complement (category remainder) scope. The interpreter only
      // marks the scope; every referent is resolved/verified here in trusted
      // code against the OWNED verified category set. A complement never runs
      // on a guessed category and never silently degrades to the aggregate.
      if (proposal.scope === "complement") {
        if (!proposal.category) {
          // Category-less complement ("the remaining categories") needs a
          // verified distribution context from an OWNED earlier exchange.
          if (context.hasDistributionContext !== true) return null;
          return {
            intent: "spendingDistribution",
            category: null,
            period: proposal.period,
            complement: { kind: "aggregate" },
          };
        }
        // Named-exclusion complement ("categories apart from X"): X must be a
        // verified owned category name (both explicit and referenced forms are
        // canonicalized against the set — never "last category wins").
        const resolved = resolveReferencedCategory(proposal.category, context.categorySet);
        if (!resolved) return null;
        return {
          intent: "spendingDistribution",
          category: null,
          period: proposal.period,
          complement: { kind: "excluding", category: resolved },
        };
      }

      // No categoryOrigin claimed: legacy behavior — a present category runs
      // as explicit categorySpend, no category is the aggregate distribution.
      if (proposal.categoryOrigin === undefined) {
        return proposal.category
          ? {
              intent: "categorySpend",
              category: proposal.category,
              period: proposal.period,
            }
          : {
              intent: "spendingDistribution",
              category: null,
              period: proposal.period,
            };
      }
      // An origin was claimed but no category value: malformed — clarify.
      if (!proposal.category) return null;
      if (proposal.categoryOrigin === "referenced") {
        // The interpreter claimed a category referent — verify it against the
        // trusted owned set. An unresolvable referent clarifies (needs_subject);
        // it is NEVER silently downgraded to the aggregate distribution.
        const resolved = resolveReferencedCategory(proposal.category, context.categorySet);
        if (!resolved) return null;
        return {
          intent: "categorySpend",
          category: resolved,
          period: proposal.period,
        };
      }
      // explicit: the user stated the category — run it as-is (the engine
      // answers honestly when no spending is recorded for it).
      return {
        intent: "categorySpend",
        category: proposal.category,
        period: proposal.period,
      };
    }
    case "expense_comparison":
      return {
        intent: "periodComparison",
        category: null,
        target: "expenses",
        period: proposal.currentPeriod,
        comparisonPeriod: proposal.priorPeriod,
      };
    case "category_ranking":
      // An explicit ranking request is a category-less aggregate: reuse the
      // trusted spendingDistribution path (ranked category totals + shares).
      // It never clarifies for a missing category — the tool is aggregate by
      // definition and carries no category argument.
      return {
        intent: "spendingDistribution",
        category: null,
        period: proposal.period,
      };
    case "balance":
      return { intent: "balance", category: null, period: { kind: "allTime" } };
    case "transactions":
      return {
        intent: "transactionCount",
        category: proposal.category ?? null,
        period: proposal.period ?? { kind: "thisMonth" },
      };
    case "goal_impact":
      return {
        intent: "expenseImpact",
        category: proposal.category,
        period: proposal.period,
        mode: "hypothetical",
        effectGoal: "expenses",
        operation: proposal.delta < 0 ? "decrease" : "increase",
        hypotheticalAmount: Math.abs(proposal.delta),
      };
    // Phase 17 — category share. The contract makes `category` REQUIRED (a
    // share is never an aggregate/complement), but the policy still never
    // trusts a bare claim: a referenced category is verified against the
    // owned verified set and an unresolvable referent clarifies (needs_subject)
    // — it is never guessed and never downgraded to the aggregate.
    case "category_share": {
      if (!proposal.category) return null;
      if (proposal.categoryOrigin === "referenced") {
        const resolved = resolveReferencedCategory(proposal.category, context.categorySet);
        if (!resolved) return null;
        return {
          intent: "categoryShare",
          category: resolved,
          period: proposal.period,
        };
      }
      return {
        intent: "categoryShare",
        category: proposal.category,
        period: proposal.period,
      };
    }
    case "search_transactions":
      return null;
  }
}