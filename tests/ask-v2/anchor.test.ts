// ============================================================
// LedgerAI — Phase 9E verified turn anchor tests (pure)
// ------------------------------------------------------------
// Covers the anchor contract, its verified derivation, the narrator-
// independent category set, and the policy context composer (structured
// anchor preferred, Phase 9D narration re-reading as compatibility fallback).
// No DB and no network: anchors are exercised as pure data.
// ============================================================

import { describe, expect, it } from "vitest";
import { assistantQuerySchema } from "@/lib/ask/contracts";
import type { AssistantIntent, AssistantMetrics } from "@/lib/finance/assistant";
import {
  askV2AnchorIntentSchema,
  askV2AnchorSchema,
  anchorCategorySet,
  anchorsFromExchanges,
  buildAskV2Anchor,
  parseAskV2Anchor,
  type AskV2TurnAnchor,
} from "@/lib/ask-v2/anchor";
import {
  askV2PolicyContextFromExchanges,
  askV2PolicyDecision,
} from "@/lib/ask-v2/policy";
import type { AskV2Proposal } from "@/lib/ask-v2/contracts";

const THIS_YEAR = { kind: "thisYear" } as const;
const LAST_MONTH = { kind: "lastMonth" } as const;

function metrics(
  categories: Array<{ name: string; amount: number }>,
): AssistantMetrics {
  const expenses = categories.reduce((sum, c) => sum + c.amount, 0);
  return {
    summary: { revenue: 0, expenses, transfers: 0, netProfit: -expenses, profitMargin: null },
    priorSummary: null,
    categoryTotals: categories.map((c) => ({
      categoryName: c.name,
      amount: c.amount,
      priorAmount: 0,
    })),
    balance: null,
    count: null,
  };
}

const INVENTORY_DISTRIBUTION = metrics([
  { name: "Inventory", amount: 418_000 },
  { name: "Rent", amount: 356_000 },
  { name: "Salaries", amount: 196_000 },
  { name: "Equipment", amount: 74_000 },
  { name: "Marketing", amount: 61_000 },
]);

function distributionAnchor(): AskV2TurnAnchor {
  return buildAskV2Anchor({
    query: { intent: "spendingDistribution", category: null, period: THIS_YEAR },
    metrics: INVENTORY_DISTRIBUTION,
    toolKeys: ["summary.get", "categories.distribution"],
    verifiedAt: new Date("2026-09-16T00:00:00.000Z"),
  });
}

function referenced(
  category: string,
  period: ExpenseBreakdownProposal["period"],
): ExpenseBreakdownProposal {
  return {
    tool: "expense_breakdown",
    period,
    category,
    categoryOrigin: "referenced",
  };
}

type ExpenseBreakdownProposal = Extract<
  AskV2Proposal,
  { tool: "expense_breakdown" }
>;

/* ------------------------------------------------------------
 * Contract (L)
 * ------------------------------------------------------------ */

describe("askV2TurnAnchor — strict contract", () => {
  it("reuses the canonical AssistantIntent vocabulary (no second vocabulary)", () => {
    const canonical = new Set<string>(
      assistantQuerySchema.options.map((branch) => branch.shape.intent.value),
    );
    const anchor = new Set<string>(askV2AnchorIntentSchema.options);
    expect(anchor).toEqual(canonical);
    expect(anchor.size).toBeGreaterThan(0);
  });

  it("accepts a canonical verified anchor", () => {
    expect(parseAskV2Anchor(distributionAnchor())).not.toBeNull();
  });

  it("rejects unknown and TENANT fields (never authoritative from outside)", () => {
    const valid = distributionAnchor();
    for (const extra of [
      { businessId: "b1" },
      { userId: "u1" },
      { tenantId: "t1" },
      { conversationId: "c1" },
      { text: "Inventory accounted for 34% of spending." },
    ]) {
      expect(askV2AnchorSchema.safeParse({ ...valid, ...extra }).success, JSON.stringify(extra)).toBe(false);
    }
  });

  it("rejects narrator prose with no structured fields", () => {
    expect(
      parseAskV2Anchor({ text: "Your largest spending category was Inventory." }),
    ).toBeNull();
  });

  it("rejects invalid enum/shape values", () => {
    const base = distributionAnchor();
    expect(askV2AnchorSchema.safeParse({ ...base, intent: "spend_by_category" }).success).toBe(false);
    expect(askV2AnchorSchema.safeParse({ ...base, kind: "guessed" }).success).toBe(false);
    expect(askV2AnchorSchema.safeParse({ ...base, toolKeys: [] }).success).toBe(false);
    expect(askV2AnchorSchema.safeParse({ ...base, verifiedAt: "yesterday" }).success).toBe(false);
    expect(askV2AnchorSchema.safeParse({ ...base, schemaVersion: 2 }).success).toBe(false);
  });

  it("safely ignores absent/null/invalid metadata", () => {
    expect(parseAskV2Anchor(null)).toBeNull();
    expect(parseAskV2Anchor(undefined)).toBeNull();
    expect(parseAskV2Anchor("Inventory")).toBeNull();
    expect(parseAskV2Anchor({ schemaVersion: 1 })).toBeNull();
  });
});

/* ------------------------------------------------------------
 * Verified derivation
 * ------------------------------------------------------------ */

describe("buildAskV2Anchor — derived exclusively from trusted execution data", () => {
  it("records the canonical intent, period, verified category set and top category", () => {
    const anchor = distributionAnchor();
    expect(anchor.intent).toBe("spendingDistribution");
    expect(anchor.period).toEqual(THIS_YEAR);
    expect(anchor.category).toBeNull();
    expect(anchor.topCategory).toBe("Inventory");
    expect([...anchor.categorySet]).toEqual([
      "Inventory",
      "Rent",
      "Salaries",
      "Equipment",
      "Marketing",
    ]);
    expect(anchor.kind).toBe("verified");
  });

  it("advances the canonical intent type unchanged", () => {
    const intent: AssistantIntent = "categorySpend";
    const anchor = buildAskV2Anchor({
      query: { intent, category: "Inventory", period: THIS_YEAR },
      metrics: INVENTORY_DISTRIBUTION,
      toolKeys: ["summary.get", "categories.listSpending"],
      verifiedAt: new Date("2026-09-16T00:00:00.000Z"),
    });
    expect(anchor.intent).toBe("categorySpend");
    expect(anchor.category).toBe("Inventory");
  });

  it("category:null stays possible and topCategory is null for non-ranking intents", () => {
    const anchor = buildAskV2Anchor({
      query: { intent: "expenses", category: null, period: LAST_MONTH },
      metrics: { ...metrics([]), categoryTotals: [] },
      toolKeys: ["summary.get"],
      verifiedAt: new Date("2026-09-16T00:00:00.000Z"),
    });
    expect(anchor.category).toBeNull();
    expect(anchor.topCategory).toBeNull();
    expect(anchor.categorySet).toEqual([]);
  });
});

/* ------------------------------------------------------------
 * A/B/C — reference resolution and narrator independence
 * ------------------------------------------------------------ */

describe("verified anchor consumption — reference resolution", () => {
  it("A: T1 distribution anchor resolves a referenced T2 category onto categorySpend", () => {
    const context = askV2PolicyContextFromExchanges([
      { answer: "…", metadata: distributionAnchor() },
    ]);
    const decision = askV2PolicyDecision(referenced("Inventory", THIS_YEAR), context);
    expect(decision.kind).toBe("answer");
    if (decision.kind === "answer") {
      expect(decision.query).toEqual({
        intent: "categorySpend",
        category: "Inventory",
        period: THIS_YEAR,
      });
    }
  });

  it("B: three narrator phrasings produce IDENTICAL anchors and resolution", () => {
    const phrasings = [
      "Inventory accounted for 34% of spending.",
      "Your largest spending category was Inventory.",
      "Most of your spending went to Inventory.",
    ];
    const decisions = phrasings.map((answer) => {
      // The SAME verified anchor is attached regardless of the prose; the
      // anchor is derived from metrics, never from the narration text.
      const context = askV2PolicyContextFromExchanges([
        { answer, metadata: distributionAnchor() },
      ]);
      const decision = askV2PolicyDecision(referenced("Inventory", THIS_YEAR), context);
      expect(decision.kind).toBe("answer");
      return decision.kind === "answer" ? decision.query : null;
    });
    for (const decision of decisions) {
      expect(decision).toEqual({
        intent: "categorySpend",
        category: "Inventory",
        period: THIS_YEAR,
      });
    }
  });

  it("C: an aggregate turn stays category-free even with a populated anchor set", () => {
    const context = askV2PolicyContextFromExchanges([
      { answer: "…", metadata: distributionAnchor() },
    ]);
    const decision = askV2PolicyDecision(
      { tool: "expense_breakdown", period: THIS_YEAR },
      context,
    );
    expect(decision.kind).toBe("answer");
    if (decision.kind === "answer") {
      expect(decision.query).toMatchObject({
        intent: "spendingDistribution",
        category: null,
      });
    }
  });
});

/* ------------------------------------------------------------
 * D/E/F — explicit overrides and invalid referents
 * ------------------------------------------------------------ */

describe("anchor consumption — overrides and invalid referents", () => {
  const context = () =>
    askV2PolicyContextFromExchanges([{ answer: "…", metadata: distributionAnchor() }]);

  it("D: an explicit category overrides the anchored context", () => {
    const decision = askV2PolicyDecision(
      {
        tool: "expense_breakdown",
        period: THIS_YEAR,
        category: "Marketing",
        categoryOrigin: "explicit",
      },
      context(),
    );
    expect(decision.kind).toBe("answer");
    if (decision.kind === "answer") {
      expect(decision.query).toMatchObject({ intent: "categorySpend", category: "Marketing" });
      expect(decision.query.category).not.toBe("Inventory");
    }
  });

  it("E: an explicit period overrides the anchored period", () => {
    const decision = askV2PolicyDecision(
      referenced("Inventory", LAST_MONTH),
      context(),
    );
    expect(decision.kind).toBe("answer");
    if (decision.kind === "answer") {
      expect(decision.query.period).toEqual(LAST_MONTH);
      expect(decision.query).toMatchObject({ category: "Inventory" });
    }
  });

  it("F: a referenced category outside the verified set clarifies — never aggregate", () => {
    expect(askV2PolicyDecision(referenced("Fuel", THIS_YEAR), context())).toEqual({
      kind: "clarification",
      reason: "needs_subject",
    });
  });
});

/* ------------------------------------------------------------
 * G/H/I/J — lifecycle, multi-turn, freshness, isolation
 * ------------------------------------------------------------ */

describe("anchor consumption — lifecycle and ownership", () => {
  it("G: a clarification turn does not erase a previous valid anchor", () => {
    const clarification = {
      answer: "Could you clarify what you'd like to know …",
      metadata: null,
    };
    const context = askV2PolicyContextFromExchanges([
      clarification,
      { answer: "…", metadata: distributionAnchor() },
    ]);
    const decision = askV2PolicyDecision(referenced("Inventory", THIS_YEAR), context);
    expect(decision.kind).toBe("answer");
  });

  it("H: membership across turns — never 'last category wins'", () => {
    const rentAnchor = buildAskV2Anchor({
      query: { intent: "categorySpend", category: "Rent", period: THIS_YEAR },
      metrics: INVENTORY_DISTRIBUTION,
      toolKeys: ["summary.get", "categories.listSpending"],
      verifiedAt: new Date("2026-09-16T00:00:00.000Z"),
    });
    // Newest-first: distribution anchor first, older Rent anchor second.
    const context = askV2PolicyContextFromExchanges([
      { answer: "…", metadata: distributionAnchor() },
      { answer: "…", metadata: rentAnchor },
    ]);
    // "Marketing" is only in the OLDER anchor's envelope but still resolves:
    // membership, not the newest anchor's own category.
    expect(askV2PolicyDecision(referenced("Marketing", THIS_YEAR), context).kind).toBe("answer");
    expect(askV2PolicyDecision(referenced("Rent", THIS_YEAR), context).kind).toBe("answer");
    expect(askV2PolicyDecision(referenced("Fuel", THIS_YEAR), context)).toEqual({
      kind: "clarification",
      reason: "needs_subject",
    });
  });

  it("I: a fresh conversation has no usable anchors and never guesses", () => {
    const context = askV2PolicyContextFromExchanges([]);
    expect(context.categorySet.size).toBe(0);
    expect(askV2PolicyDecision(referenced("Inventory", THIS_YEAR), context)).toEqual({
      kind: "clarification",
      reason: "needs_subject",
    });
  });

  it("J: the context is a pure function of the OWNED window (no cross-tenant leak)", () => {
    // A foreign anchor passed to a DIFFERENT conversation's consumer would be a
    // caller bug; the composer only ever sees the caller's owned window, so an
    // empty window yields an empty set.
    expect(askV2PolicyContextFromExchanges([]).categorySet.size).toBe(0);
    expect(anchorCategorySet(anchorsFromExchanges([])).size).toBe(0);
    // And a foreign/invalid metadata object is never trusted.
    expect(
      anchorCategorySet(anchorsFromExchanges([{ answer: "x", metadata: { businessId: "b" } }])).size,
    ).toBe(0);
  });

  it("collects only valid anchors from a mixed window", () => {
    const anchors = anchorsFromExchanges([
      { answer: "…", metadata: distributionAnchor() },
      { answer: "…", metadata: null },
      { answer: "…", metadata: { schemaVersion: 1, intent: "nonsense" } },
      { answer: "…" },
    ]);
    expect(anchors).toHaveLength(1);
  });
});

/* ------------------------------------------------------------
 * K — pre-9E compatibility (null metadata falls back to narration)
 * ------------------------------------------------------------ */

describe("pre-9E rows (metadata NULL) remain usable via the narration fallback", () => {
  const NARRATION =
    "In 2026 your spending broke down as Inventory (34%), Rent (29%), Salaries (16%), Equipment (6%) and Marketing (5%). 6 more categories make up the rest of the ₦1,229,600 total.";

  it("K: null metadata is ignored safely and the deterministic narration is re-read", () => {
    const context = askV2PolicyContextFromExchanges([
      { answer: NARRATION, metadata: null },
    ]);
    expect(context.categorySet.has("Inventory")).toBe(true);
    expect(
      askV2PolicyDecision(referenced("Inventory", THIS_YEAR), context).kind,
    ).toBe("answer");
  });

  it("K: a valid anchor takes precedence over unparseable prose", () => {
    const context = askV2PolicyContextFromExchanges([
      {
        answer: "Most of your spending went to Inventory.",
        metadata: distributionAnchor(),
      },
    ]);
    expect(context.categorySet.has("Inventory")).toBe(true);
    expect(context.categorySet.has("Rent")).toBe(true);
  });

  it("K: the verified anchor WINS over contradictory narration", () => {
    // The prose names a category that the verified engine never established;
    // the structured anchor is authoritative, so the prose is never read.
    const context = askV2PolicyContextFromExchanges([
      {
        answer: "Most of your spending went to Fuel.",
        metadata: distributionAnchor(),
      },
    ]);
    expect(context.categorySet.has("Inventory")).toBe(true);
    expect(context.categorySet.has("Fuel")).toBe(false);
    expect(askV2PolicyDecision(referenced("Fuel", THIS_YEAR), context)).toEqual({
      kind: "clarification",
      reason: "needs_subject",
    });
  });

  it("K: fallback is per-row — anchored rows ignore prose, unanchored rows re-read it", () => {
    const context = askV2PolicyContextFromExchanges([
      { answer: "Fuel dominated spending.", metadata: distributionAnchor() },
      { answer: NARRATION, metadata: null },
    ]);
    expect(context.categorySet.has("Inventory")).toBe(true);
    expect(context.categorySet.has("Rent")).toBe(true);
    expect(context.categorySet.has("Fuel")).toBe(false);
  });
});
