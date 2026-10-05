import { describe, expect, it } from "vitest";
import { executionPlanSchema, internalToolKeySchema } from "@/lib/ask/contracts";
import {
  askV2PolicyDecision,
  askV2PolicyContextFromExchanges,
  ownedCategorySet,
} from "@/lib/ask-v2/policy";
import { askV2ToolSchema, type AskV2Proposal } from "@/lib/ask-v2/contracts";
import { buildAskV2Anchor } from "@/lib/ask-v2/anchor";

const ALLOWED_KEYS: readonly string[] = internalToolKeySchema.options;

/** A message that deterministically PROVES the given goal_impact delta
 *  (magnitude + direction) through the F-1 provenance gate. */
function goalImpactMessage(delta: number): string {
  return delta < 0
    ? "What if I spent ₦50,000 less on Food this month?"
    : "What if I spent ₦120,000 more on Rent this year?";
}

/** Decide for a proposal, supplying the provenance message a goal_impact
 *  proposal needs (other tools never consult the message). */
function decide(proposal: AskV2Proposal) {
  return proposal.tool === "goal_impact"
    ? askV2PolicyDecision(proposal, undefined, goalImpactMessage((proposal as { delta: number }).delta))
    : askV2PolicyDecision(proposal);
}

describe("askV2PolicyDecision — tool-key allow-list", () => {
  it("derives every allowed key from the canonical allow-list", () => {
    const tools: AskV2Proposal[] = [
      { tool: "expense_summary", period: { kind: "thisMonth" } },
      { tool: "expense_breakdown", period: { kind: "lastMonth" } },
      { tool: "expense_comparison", currentPeriod: { kind: "lastMonth" }, priorPeriod: { kind: "thisYear" } },
      { tool: "category_ranking", period: { kind: "thisYear" } },
      { tool: "balance" },
      { tool: "transactions" },
      { tool: "goal_impact", category: "Food", delta: -50000, period: { kind: "thisMonth" } },
      { tool: "category_share", period: { kind: "thisYear" }, category: "Rent", categoryOrigin: "explicit" },
    ];
    for (const proposal of tools) {
      const decision = decide(proposal);
      expect(decision.kind, JSON.stringify(proposal)).toBe("answer");
      if (decision.kind !== "answer") continue;
      expect(decision.toolKeys.length).toBeGreaterThan(0);
      for (const key of decision.toolKeys) {
        expect(ALLOWED_KEYS).toContain(key);
      }
    }
  });

  it("maps expense_summary to exactly the summary tool key", () => {
    const decision = askV2PolicyDecision({ tool: "expense_summary", period: { kind: "thisMonth" } });
    expect(decision).toMatchObject({ kind: "answer", toolKeys: ["summary.get"] });
  });

  it("never assigns more than three tool keys", () => {
    const decision = askV2PolicyDecision({ tool: "expense_breakdown", period: { kind: "thisMonth" } });
    expect(decision.kind).toBe("answer");
    if (decision.kind === "answer") expect(decision.toolKeys.length).toBeLessThanOrEqual(3);
  });
});

describe("askV2PolicyDecision — unsupported tools", () => {
  it("refuses search_transactions until a deterministic engine path exists", () => {
    const decision = askV2PolicyDecision({ tool: "search_transactions", query: "kwame" });
    expect(decision).toEqual({ kind: "unsupported", reason: "not_supported" });
  });
});

describe("askV2PolicyDecision — canonical query mapping", () => {
  it("maps expense_summary onto intent expenses", () => {
    const decision = askV2PolicyDecision({ tool: "expense_summary", period: { kind: "lastMonth" } });
    expect(decision.kind).toBe("answer");
    if (decision.kind === "answer") {
      expect(decision.query.intent).toBe("expenses");
      expect(decision.query.period).toEqual({ kind: "lastMonth" });
    }
  });

  it("maps expense_breakdown to distribution without a category", () => {
    const decision = askV2PolicyDecision({ tool: "expense_breakdown", period: { kind: "thisYear" } });
    expect(decision.kind).toBe("answer");
    if (decision.kind === "answer") expect(decision.query.intent).toBe("spendingDistribution");
  });

  it("maps expense_breakdown with a category onto categorySpend", () => {
    const decision = askV2PolicyDecision({ tool: "expense_breakdown", period: { kind: "thisMonth" }, category: "Rent" });
    expect(decision.kind).toBe("answer");
    if (decision.kind === "answer") {
      expect(decision.query).toMatchObject({ intent: "categorySpend", category: "Rent" });
    }
  });

  it("maps category_ranking onto the aggregate spendingDistribution path", () => {
    const decision = askV2PolicyDecision({ tool: "category_ranking", period: { kind: "thisYear" } });
    expect(decision.kind).toBe("answer");
    if (decision.kind === "answer") {
      expect(decision.query).toEqual({
        intent: "spendingDistribution",
        category: null,
        period: { kind: "thisYear" },
      });
      expect(decision.toolKeys).toEqual([
        "summary.get",
        "categories.listSpending",
        "categories.distribution",
      ]);
      const parsed = executionPlanSchema.safeParse(decision.plan);
      expect(parsed.success).toBe(true);
    }
  });

  it("category_ranking never clarifies or turns unsupported with no owned context", () => {
    const decision = askV2PolicyDecision({ tool: "category_ranking", period: { kind: "thisMonth" } }, { categorySet: new Set() });
    expect(decision).not.toMatchObject({ kind: "clarification" });
    expect(decision).not.toMatchObject({ kind: "unsupported" });
    expect(decision.kind).toBe("answer");
  });

  it("regression: existing summary and breakdown behavior is unchanged", () => {
    const summary = askV2PolicyDecision({ tool: "expense_summary", period: { kind: "lastMonth" } });
    expect(summary.kind).toBe("answer");
    if (summary.kind === "answer") {
      expect(summary.query).toMatchObject({ intent: "expenses", category: null, period: { kind: "lastMonth" } });
      expect(summary.toolKeys).toEqual(["summary.get"]);
    }

    const aggregate = askV2PolicyDecision({ tool: "expense_breakdown", period: { kind: "thisYear" } });
    expect(aggregate.kind).toBe("answer");
    if (aggregate.kind === "answer") {
      expect(aggregate.query).toMatchObject({ intent: "spendingDistribution", category: null });
      expect(aggregate.toolKeys).toEqual([
        "summary.get",
        "categories.listSpending",
        "categories.distribution",
      ]);
    }

    const scoped = askV2PolicyDecision({ tool: "expense_breakdown", period: { kind: "thisMonth" }, category: "Rent", categoryOrigin: "explicit" });
    expect(scoped.kind).toBe("answer");
    if (scoped.kind === "answer") {
      expect(scoped.query).toMatchObject({ intent: "categorySpend", category: "Rent" });
    }
  });

  it("maps expense_comparison onto periodComparison with both periods", () => {
    const decision = askV2PolicyDecision({
      tool: "expense_comparison",
      currentPeriod: { kind: "lastMonth" },
      priorPeriod: { kind: "month", month: 6, year: 2026 },
    });
    expect(decision.kind).toBe("answer");
    if (decision.kind === "answer") {
      expect(decision.query).toMatchObject({
        intent: "periodComparison",
        target: "expenses",
        comparisonPeriod: { kind: "month", month: 6, year: 2026 },
      });
    }
  });

  it("defaults a bare transactions proposal to this month", () => {
    const decision = askV2PolicyDecision({ tool: "transactions" });
    expect(decision.kind).toBe("answer");
    if (decision.kind === "answer") {
      expect(decision.query).toMatchObject({ intent: "transactionCount", period: { kind: "thisMonth" }, category: null });
    }
  });

  it("maps goal_impact onto the trusted hypothetical path", () => {
    const decision = askV2PolicyDecision(
      { tool: "goal_impact", category: "Food", delta: -50000, period: { kind: "thisMonth" } },
      undefined,
      "What if I spent ₦50,000 less on Food this month?",
    );
    expect(decision.kind).toBe("answer");
    if (decision.kind === "answer") {
      expect(decision.query).toMatchObject({
        intent: "expenseImpact",
        category: "Food",
        mode: "hypothetical",
        effectGoal: "expenses",
        operation: "decrease",
        hypotheticalAmount: 50000,
      });
    }
  });

  it("treats a positive delta as an increase", () => {
    const decision = askV2PolicyDecision(
      { tool: "goal_impact", category: "Rent", delta: 120000, period: { kind: "allTime" } },
      undefined,
      "What if I spent ₦120,000 more on Rent this year?",
    );
    expect(decision.kind).toBe("answer");
    if (decision.kind === "answer") {
      expect(decision.query).toMatchObject({ operation: "increase", hypotheticalAmount: 120000 });
    }
  });
});

describe("askV2PolicyDecision — F-1 goal_impact delta provenance gate", () => {
  const DECREASE = { tool: "goal_impact", category: "Food", delta: -50000, period: { kind: "thisMonth" } } as const;

  it("never executes a goal_impact with no user message (proposal-only surfaces)", () => {
    const decision = askV2PolicyDecision({ tool: "goal_impact", category: "Food", delta: -50000, period: { kind: "thisMonth" } });
    expect(decision).toEqual({ kind: "clarification", reason: "ambiguous_amount" });
  });

  it("clarifies when the user's message is not a spending-change claim", () => {
    const decision = askV2PolicyDecision(DECREASE, undefined, "What did I spend last month?");
    expect(decision).toEqual({ kind: "clarification", reason: "ambiguous_amount" });
  });

  it("clarifies when the proposed amount is not the user's stated change amount", () => {
    const decision = askV2PolicyDecision(DECREASE, undefined, "What if I spent ₦10,000 less on Food this month?");
    expect(decision).toEqual({ kind: "clarification", reason: "ambiguous_amount" });
  });

  it("clarifies when the delta direction contradicts the user's stated change", () => {
    const decision = askV2PolicyDecision(
      { tool: "goal_impact", category: "Food", delta: 50000, period: { kind: "thisMonth" } },
      undefined,
      "What if I spent ₦50,000 less on Food this month?",
    );
    expect(decision).toEqual({ kind: "clarification", reason: "ambiguous_amount" });
  });

  it("never fabricates magnitude from a bare goal_impact request", () => {
    const decision = askV2PolicyDecision(DECREASE, undefined, "What if I spent less on Food this month?");
    expect(decision).toEqual({ kind: "clarification", reason: "ambiguous_amount" });
  });

  it("executes only after the delta is proven against the user's wording", () => {
    const decision = askV2PolicyDecision(DECREASE, undefined, "What if I spent ₦50,000 less on Food this month?");
    expect(decision.kind).toBe("answer");
    if (decision.kind === "answer") {
      expect(decision.query).toMatchObject({ intent: "expenseImpact", hypotheticalAmount: 50000 });
    }
  });
});

describe("askV2PolicyDecision — plan contracts hold by construction", () => {
  it("emits a plan that passes the canonical execution-plan schema", () => {
    const decision = askV2PolicyDecision({ tool: "expense_breakdown", period: { kind: "thisMonth" }, category: "Food" });
    expect(decision.kind).toBe("answer");
    if (decision.kind !== "answer") return;
    const parsed = executionPlanSchema.safeParse(decision.plan);
    expect(parsed.success).toBe(true);
  });

  it("never recreates v1 NLU: the plan is built directly, not compiled", () => {
    const decision = askV2PolicyDecision({ tool: "balance" });
    expect(decision.kind).toBe("answer");
    if (decision.kind === "answer") expect(decision.plan.kind).toBe("answer");
  });
});

describe("askV2PolicyDecision — no write capability is selectable", () => {
  it("the v2 tool vocabulary contains no write-capable tool", () => {
    const tools = askV2ToolSchema.options;
    expect(tools.length).toBeGreaterThan(0);
    for (const tool of tools) {
      expect(tool).not.toMatch(/delete|create|update|write/i);
    }
  });

  it("every internal tool key the policy may emit is a canonical read-only derivation", () => {
    const proposals: AskV2Proposal[] = [
      { tool: "expense_summary", period: { kind: "thisMonth" } },
      { tool: "expense_breakdown", period: { kind: "lastMonth" } },
      { tool: "expense_comparison", currentPeriod: { kind: "lastMonth" }, priorPeriod: { kind: "thisYear" } },
      { tool: "category_ranking", period: { kind: "thisYear" } },
      { tool: "balance" },
      { tool: "transactions" },
      { tool: "goal_impact", category: "Food", delta: -50000, period: { kind: "thisMonth" } },
      { tool: "category_share", period: { kind: "thisYear" }, category: "Rent", categoryOrigin: "explicit" },
    ];
    for (const proposal of proposals) {
      const decision = decide(proposal);
      expect(decision.kind).toBe("answer");
      if (decision.kind === "answer") {
        for (const key of decision.toolKeys) {
          expect(key).toMatch(/^(summary\.get|balance\.get|categories\..*|period\.compare|expense\.impact|transactions\.count)$/);
          expect(key).not.toMatch(/delete|create|update|write/i);
        }
      }
    }
  });
});

describe("askV2PolicyDecision — Phase 9D category-reference integrity", () => {
  const OWNED = new Set(["Inventory", "Rent", "Salaries", "Equipment", "Marketing"]);

  it("A: a referenced category from the trusted owned set resolves onto categorySpend", () => {
    const decision = askV2PolicyDecision(
      { tool: "expense_breakdown", period: { kind: "thisYear" }, category: "inventory", categoryOrigin: "referenced" },
      { categorySet: OWNED },
    );
    expect(decision.kind).toBe("answer");
    if (decision.kind === "answer") {
      expect(decision.query).toEqual({
        intent: "categorySpend",
        category: "Inventory",
        period: { kind: "thisYear" },
      });
    }
  });

  it("B: a category-less expense_breakdown stays an aggregate distribution", () => {
    const decision = askV2PolicyDecision({ tool: "expense_breakdown", period: { kind: "thisYear" } });
    expect(decision.kind).toBe("answer");
    if (decision.kind === "answer") {
      expect(decision.query).toMatchObject({
        intent: "spendingDistribution",
        category: null,
        period: { kind: "thisYear" },
      });
    }
  });

  it("C: an explicit category is never overridden by the trusted set", () => {
    const decision = askV2PolicyDecision(
      { tool: "expense_breakdown", period: { kind: "thisYear" }, category: "Marketing", categoryOrigin: "explicit" },
      { categorySet: OWNED },
    );
    expect(decision.kind).toBe("answer");
    if (decision.kind === "answer") {
      expect(decision.query).toMatchObject({ intent: "categorySpend", category: "Marketing" });
      expect(decision.query.category).not.toBe("Inventory");
    }
  });

  it("D: an explicit period is preserved over any historical period", () => {
    const decision = askV2PolicyDecision(
      { tool: "expense_breakdown", period: { kind: "lastMonth" }, category: "Inventory", categoryOrigin: "explicit" },
      { categorySet: OWNED },
    );
    expect(decision.kind).toBe("answer");
    if (decision.kind === "answer") {
      expect(decision.query.period).toEqual({ kind: "lastMonth" });
      expect(decision.query).toMatchObject({ intent: "categorySpend", category: "Inventory" });
    }
  });

  it("E: a referenced category outside the trusted set clarifies — never aggregate or guess", () => {
    const unresolvable: AskV2Proposal = {
      tool: "expense_breakdown",
      period: { kind: "thisYear" },
      category: "Fuel",
      categoryOrigin: "referenced",
    };
    expect(askV2PolicyDecision(unresolvable, { categorySet: OWNED })).toEqual({
      kind: "clarification",
      reason: "needs_subject",
    });

    const originWithoutCategory: AskV2Proposal = {
      tool: "expense_breakdown",
      period: { kind: "thisYear" },
      categoryOrigin: "referenced",
    };
    expect(askV2PolicyDecision(originWithoutCategory, { categorySet: OWNED })).toEqual({
      kind: "clarification",
      reason: "needs_subject",
    });
  });

  it("F: with no owned context a referenced category never guesses", () => {
    const decision = askV2PolicyDecision(
      { tool: "expense_breakdown", period: { kind: "thisYear" }, category: "Inventory", categoryOrigin: "referenced" },
      { categorySet: new Set() },
    );
    expect(decision).toEqual({ kind: "clarification", reason: "needs_subject" });
  });

  it("re-derives the trusted owned set from OUR OWN deterministic narration", () => {
    const exchanges = [
      {
        content: "from the beginning of this year till now, what did i spend most of my money on?",
        answer:
          "In 2026 your spending broke down as Inventory (34%), Rent (29%), Salaries (16%), Equipment (6%) and Marketing (5%). 6 more categories make up the rest of the ₦1,229,600 total.",
      },
    ];
    const set = ownedCategorySet(exchanges);
    expect(set.size).toBe(5);
    expect(set.has("Inventory")).toBe(true);
    expect(set.has("Marketing")).toBe(true);
    expect(set.has("Fuel")).toBe(false);
  });
});

describe("askV2PolicyDecision — Phase 15 category complement ('remaining categories')", () => {
  const OWNED = new Set(["Inventory", "Rent", "Salaries", "Equipment", "Marketing"]);
  const DISTRIBUTION_CONTEXT = { categorySet: OWNED, hasDistributionContext: true };

  it("A: a category-less complement runs only with a verified distribution context", () => {
    const proposal: AskV2Proposal = {
      tool: "expense_breakdown",
      period: { kind: "thisYear" },
      scope: "complement",
    };
    expect(askV2PolicyDecision(proposal, DISTRIBUTION_CONTEXT).kind).toBe("answer");
    const decision = askV2PolicyDecision(proposal, DISTRIBUTION_CONTEXT);
    if (decision.kind === "answer") {
      expect(decision.query).toEqual({
        intent: "spendingDistribution",
        category: null,
        period: { kind: "thisYear" },
        complement: { kind: "aggregate" },
      });
      expect(decision.toolKeys).toEqual([
        "summary.get",
        "categories.listSpending",
        "categories.distribution",
      ]);
      const parsed = executionPlanSchema.safeParse(decision.plan);
      expect(parsed.success).toBe(true);
    }
  });

  it("B: a category-less complement with NO distribution context clarifies (never 'last category wins')", () => {
    const proposal: AskV2Proposal = {
      tool: "expense_breakdown",
      period: { kind: "thisYear" },
      scope: "complement",
    };
    expect(askV2PolicyDecision(proposal, { categorySet: OWNED })).toEqual({
      kind: "clarification",
      reason: "needs_subject",
    });
    expect(askV2PolicyDecision(proposal)).toEqual({
      kind: "clarification",
      reason: "needs_subject",
    });
  });

  it("C: an excluding complement resolves the named category against the owned set (explicit + referenced)", () => {
    for (const categoryOrigin of ["explicit", "referenced"] as const) {
      const decision = askV2PolicyDecision(
        {
          tool: "expense_breakdown",
          period: { kind: "thisYear" },
          category: "rent",
          categoryOrigin,
          scope: "complement",
        },
        { categorySet: OWNED, hasDistributionContext: true },
      );
      expect(decision.kind).toBe("answer");
      if (decision.kind === "answer") {
        expect(decision.query).toEqual({
          intent: "spendingDistribution",
          category: null,
          period: { kind: "thisYear" },
          complement: { kind: "excluding", category: "Rent" },
        });
      }
    }
  });

  it("D: an excluding complement naming an unverified category clarifies — never excludes silently", () => {
    const unresolvable: AskV2Proposal = {
      tool: "expense_breakdown",
      period: { kind: "thisYear" },
      category: "Fuel",
      categoryOrigin: "explicit",
      scope: "complement",
    };
    expect(askV2PolicyDecision(unresolvable, { categorySet: OWNED, hasDistributionContext: true })).toEqual({
      kind: "clarification",
      reason: "needs_subject",
    });

    const referenced: AskV2Proposal = {
      tool: "expense_breakdown",
      period: { kind: "thisYear" },
      category: "Fuel",
      categoryOrigin: "referenced",
      scope: "complement",
    };
    expect(askV2PolicyDecision(referenced, { categorySet: OWNED, hasDistributionContext: true })).toEqual({
      kind: "clarification",
      reason: "needs_subject",
    });
  });

  it("E: an excluding complement with no owned context never guesses", () => {
    const proposal: AskV2Proposal = {
      tool: "expense_breakdown",
      period: { kind: "thisYear" },
      category: "Rent",
      categoryOrigin: "explicit",
      scope: "complement",
    };
    expect(askV2PolicyDecision(proposal, { categorySet: new Set() })).toEqual({
      kind: "clarification",
      reason: "needs_subject",
    });
  });

  it("F: an explicit 'aggregate' scope is identical to the legacy aggregate distribution", () => {
    const decision = askV2PolicyDecision(
      { tool: "expense_breakdown", period: { kind: "thisYear" }, scope: "aggregate" },
      DISTRIBUTION_CONTEXT,
    );
    expect(decision.kind).toBe("answer");
    if (decision.kind === "answer") {
      expect(decision.query).toEqual({
        intent: "spendingDistribution",
        category: null,
        period: { kind: "thisYear" },
      });
      expect(decision.query.complement).toBeUndefined();
    }
  });

  it("G: a legacy expense_breakdown (no scope) keeps its exact pre-Phase-15 behavior", () => {
    const aggregate = askV2PolicyDecision({ tool: "expense_breakdown", period: { kind: "thisYear" } });
    expect(aggregate.kind).toBe("answer");
    if (aggregate.kind === "answer") expect(aggregate.query.complement).toBeUndefined();

    const scoped = askV2PolicyDecision(
      { tool: "expense_breakdown", period: { kind: "thisMonth" }, category: "Rent", categoryOrigin: "explicit" },
      { categorySet: OWNED },
    );
    expect(scoped.kind).toBe("answer");
    if (scoped.kind === "answer") {
      expect(scoped.query).toMatchObject({ intent: "categorySpend", category: "Rent" });
      expect(scoped.query.complement).toBeUndefined();
    }
  });
});

describe("askV2PolicyContextFromExchanges — Phase 15 distribution context", () => {
  const NOW = new Date("2026-08-15T12:00:00.000Z");

  function distributionAnchor() {
    return buildAskV2Anchor({
      query: { intent: "spendingDistribution", category: null, period: { kind: "thisYear" } },
      metrics: {
        summary: { revenue: 0, expenses: 1_000_000, transfers: 0, netProfit: -1_000_000, profitMargin: null },
        priorSummary: null,
        categoryTotals: [
          { categoryName: "Inventory", amount: 400_000, priorAmount: 0 },
          { categoryName: "Rent", amount: 300_000, priorAmount: 0 },
        ],
        balance: null,
        count: null,
      },
      toolKeys: ["summary.get", "categories.listSpending", "categories.distribution"],
      verifiedAt: NOW,
    });
  }

  it("a VERIFIED distribution anchor establishes hasDistributionContext + the owned set", () => {
    const context = askV2PolicyContextFromExchanges([
      { answer: null, metadata: distributionAnchor() },
    ]);
    expect(context.hasDistributionContext).toBe(true);
    expect(context.categorySet.has("Inventory")).toBe(true);
    expect(context.categorySet.has("Rent")).toBe(true);
  });

  it("our OWN deterministic distribution narration establishes it as the compatibility fallback", () => {
    const context = askV2PolicyContextFromExchanges([
      {
        answer:
          "In 2026 your spending broke down as Inventory (34%), Rent (29%). 2 more categories make up the rest of the ₦1,229,600 total.",
        metadata: undefined,
      },
    ]);
    expect(context.hasDistributionContext).toBe(true);
    expect(context.categorySet.has("Inventory")).toBe(true);
  });

  it("a non-distribution anchor (summary) does NOT establish a distribution context", () => {
    const summaryAnchor = buildAskV2Anchor({
      query: { intent: "expenses", category: null, period: { kind: "thisYear" } },
      metrics: {
        summary: { revenue: 1_000_000, expenses: 400_000, transfers: 0, netProfit: 600_000, profitMargin: 60 },
        priorSummary: null,
        categoryTotals: [],
        balance: null,
        count: null,
      },
      toolKeys: ["summary.get"],
      verifiedAt: NOW,
    });
    const context = askV2PolicyContextFromExchanges([{ answer: null, metadata: summaryAnchor }]);
    expect(context.hasDistributionContext).toBe(false);
  });

  it("an empty window never establishes a distribution context", () => {
    expect(askV2PolicyContextFromExchanges([]).hasDistributionContext).toBe(false);
  });
});

describe("askV2PolicyDecision — Phase 17 category share", () => {
  const OWNED = new Set(["Inventory", "Rent", "Salaries", "Equipment", "Marketing"]);

  it("A: an explicit fresh category share maps onto the categoryShare intent with the exact tool keys", () => {
    const decision = askV2PolicyDecision(
      { tool: "category_share", period: { kind: "thisYear" }, category: "Rent", categoryOrigin: "explicit" },
      { categorySet: OWNED },
    );
    expect(decision.kind).toBe("answer");
    if (decision.kind === "answer") {
      expect(decision.query).toEqual({
        intent: "categoryShare",
        category: "Rent",
        period: { kind: "thisYear" },
      });
      expect(decision.toolKeys).toEqual([
        "summary.get",
        "categories.listSpending",
        "categories.distribution",
      ]);
      const parsed = executionPlanSchema.safeParse(decision.plan);
      expect(parsed.success).toBe(true);
    }
  });

  it("B: a legacy category share (no origin claimed) runs as explicit", () => {
    const decision = askV2PolicyDecision(
      { tool: "category_share", period: { kind: "thisYear" }, category: "Inventory" },
      { categorySet: OWNED },
    );
    expect(decision.kind).toBe("answer");
    if (decision.kind === "answer") {
      expect(decision.query).toMatchObject({ intent: "categoryShare", category: "Inventory" });
    }
  });

  it("C: a referenced category share canonicalizes against the owned verified set", () => {
    const decision = askV2PolicyDecision(
      { tool: "category_share", period: { kind: "thisYear" }, category: "rent", categoryOrigin: "referenced" },
      { categorySet: OWNED },
    );
    expect(decision.kind).toBe("answer");
    if (decision.kind === "answer") {
      expect(decision.query).toEqual({
        intent: "categoryShare",
        category: "Rent",
        period: { kind: "thisYear" },
      });
    }
  });

  it("D: an unresolvable referenced category share clarifies — never guesses", () => {
    const unresolvable = askV2PolicyDecision(
      { tool: "category_share", period: { kind: "thisYear" }, category: "Fuel", categoryOrigin: "referenced" },
      { categorySet: OWNED },
    );
    expect(unresolvable).toEqual({ kind: "clarification", reason: "needs_subject" });
  });

  it("E: a referenced category share with NO owned context clarifies", () => {
    const decision = askV2PolicyDecision(
      { tool: "category_share", period: { kind: "thisYear" }, category: "Inventory", categoryOrigin: "referenced" },
      { categorySet: new Set() },
    );
    expect(decision).toEqual({ kind: "clarification", reason: "needs_subject" });
  });

  it("F: an explicit category and period are never overridden by history", () => {
    const decision = askV2PolicyDecision(
      { tool: "category_share", period: { kind: "lastMonth" }, category: "Marketing", categoryOrigin: "explicit" },
      { categorySet: OWNED },
    );
    expect(decision.kind).toBe("answer");
    if (decision.kind === "answer") {
      expect(decision.query).toMatchObject({ intent: "categoryShare", category: "Marketing" });
      expect(decision.query.period).toEqual({ kind: "lastMonth" });
    }
  });

  it("G: a category share is never a complement or aggregate — no complement field", () => {
    const decision = askV2PolicyDecision(
      { tool: "category_share", period: { kind: "thisYear" }, category: "Rent", categoryOrigin: "explicit" },
      { categorySet: OWNED },
    );
    expect(decision.kind).toBe("answer");
    if (decision.kind === "answer") {
      expect(decision.query).toMatchObject({ intent: "categoryShare" });
      expect(decision.query.complement).toBeUndefined();
    }
  });

  it("H: a category share on a literal Other stays a category, never the remainder", () => {
    const decision = askV2PolicyDecision(
      { tool: "category_share", period: { kind: "thisYear" }, category: "Other", categoryOrigin: "explicit" },
      { categorySet: OWNED },
    );
    expect(decision.kind).toBe("answer");
    if (decision.kind === "answer") {
      expect(decision.query).toMatchObject({ intent: "categoryShare", category: "Other" });
    }
  });
});