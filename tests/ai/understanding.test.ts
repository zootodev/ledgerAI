import { describe, expect, it } from "vitest";
import {
  toAssistantQuery,
  understandingOutputSchema,
} from "@/lib/ai/understanding";

describe("understandingOutputSchema (constrained structured output)", () => {
  it("accepts valid data-intent output for the whole capability catalogue", () => {
    const cases = [
      { intent: "balance", period: { kind: "this_month" } },
      { intent: "income", period: { kind: "last_month" } },
      { intent: "expenses", period: { kind: "this_year" } },
      { intent: "profit", period: { kind: "all_time" } },
      { intent: "profit_margin", period: { kind: "this_month" } },
      { intent: "transaction_count", period: { kind: "this_month" } },
      { intent: "top_category", period: { kind: "this_month" } },
      { intent: "lowest_category", period: { kind: "all_time" } },
      { intent: "expense_impact", period: { kind: "this_year" }, dimension: "category" },
      { intent: "spending_distribution", period: { kind: "this_month" } },
      { intent: "expense_breakdown", period: { kind: "this_month" } },
      { intent: "expense_breakdown", period: { kind: "this_year" }, dimension: "category" },
      { intent: "income_vs_expenses", period: { kind: "last_year" } },
      {
        intent: "period_comparison",
        period: { kind: "month", month: 5, year: 2026 },
        target: "income",
        comparison: "previous_period",
      },
    ] as const;
    for (const payload of cases) {
      expect(
        understandingOutputSchema.safeParse({
          classification: "query",
          ...payload,
        }).success,
        JSON.stringify(payload),
      ).toBe(true);
    }
  });

  it("maps conscious periods: last year and rolling recent windows", () => {
    expect(
      understandingOutputSchema.safeParse({
        classification: "query",
        intent: "income",
        period: { kind: "last_year" },
      }).success,
    ).toBe(true);
    expect(
      understandingOutputSchema.safeParse({
        classification: "query",
        intent: "expenses",
        period: { kind: "recent", days: 30 },
      }).success,
    ).toBe(true);
  });

  it("accepts clarification and unsupported intents", () => {
    expect(
      understandingOutputSchema.safeParse({
        classification: "clarification",
        reason: "ambiguous_financial_metric",
      }).success,
    ).toBe(true);
    expect(
      understandingOutputSchema.safeParse({
        classification: "unsupported",
        reason: "non_financial",
      }).success,
    ).toBe(true);
  });

  it("rejects unknown, unsafe, or non-conforming intents", () => {
    expect(
      understandingOutputSchema.safeParse({
        classification: "query",
        intent: "delete_everything",
        period: { kind: "this_month" },
      }).success,
    ).toBe(false);
    expect(
      understandingOutputSchema.safeParse({
        classification: "query",
        intent: "SELECT * FROM transactions",
        period: { kind: "this_month" },
      }).success,
    ).toBe(false);
    expect(
      understandingOutputSchema.safeParse({
        classification: "query",
        intent: "expenses",
        period: { kind: "never" },
      }).success,
    ).toBe(false);
    expect(
      understandingOutputSchema.safeParse({
        classification: "unsupported",
        reason: "",
      }).success,
    ).toBe(false);
    expect(
      understandingOutputSchema.safeParse(
        "not an object",
      ).success,
    ).toBe(false);
    expect(
      understandingOutputSchema.safeParse({
        intent: "expenses",
        period: { kind: "this_month" },
      }).success,
    ).toBe(false);
  });

  it("rejects out-of-range, non-integer, or future years in explicit months", () => {
    const base = { classification: "query" as const, intent: "expenses" as const };
    expect(
      understandingOutputSchema.safeParse({
        ...base,
        period: { kind: "month", month: 13, year: 2026 },
      }).success,
    ).toBe(false);
    expect(
      understandingOutputSchema.safeParse({
        ...base,
        period: { kind: "month", month: -1, year: 2026 },
      }).success,
    ).toBe(false);
    expect(
      understandingOutputSchema.safeParse({
        ...base,
        period: { kind: "month", month: 4.5, year: 2026 },
      }).success,
    ).toBe(false);
    expect(
      understandingOutputSchema.safeParse({
        ...base,
        period: { kind: "month", month: 11, year: 2101 },
      }).success,
    ).toBe(false);
    expect(
      understandingOutputSchema.safeParse({
        ...base,
        period: { kind: "month", month: 0, year: 2026 },
      }).success,
    ).toBe(true);
    expect(
      understandingOutputSchema.safeParse({
        ...base,
        period: { kind: "recent", days: 400 },
      }).success,
    ).toBe(false);
  });

  it("rejects a category_spend without an entity at the engine boundary", () => {
    // The schema accepts the shape (entity is an optional query field), but
    // the trusted mapping refuses to build a query without a named entity.
    expect(
      understandingOutputSchema.safeParse({
        classification: "query",
        intent: "category_spend",
        period: { kind: "this_month" },
        entity: "Rent",
      }).success,
    ).toBe(true);
    expect(
      toAssistantQuery({
        classification: "query",
        intent: "category_spend",
        period: { kind: "this_month" },
      }),
    ).toBeNull();
  });
});

describe("toAssistantQuery", () => {
  it("maps every data intent into an engine query", () => {
    expect(
      toAssistantQuery({
        classification: "query",
        intent: "balance",
        period: { kind: "this_month" },
      }),
    ).toEqual({ intent: "balance", category: null, period: { kind: "thisMonth" } });
    expect(
      toAssistantQuery({
        classification: "query",
        intent: "income",
        period: { kind: "this_year" },
      }),
    ).toEqual({ intent: "income", category: null, period: { kind: "thisYear" } });
    expect(
      toAssistantQuery({
        classification: "query",
        intent: "expenses",
        period: { kind: "last_month" },
      }),
    ).toEqual({ intent: "expenses", category: null, period: { kind: "lastMonth" } });
    expect(
      toAssistantQuery({
        classification: "query",
        intent: "profit",
        period: { kind: "all_time" },
      }),
    ).toEqual({ intent: "profit", category: null, period: { kind: "allTime" } });
    expect(
      toAssistantQuery({
        classification: "query",
        intent: "profit_margin",
        period: { kind: "this_month" },
      }),
    ).toEqual({ intent: "profitMargin", category: null, period: { kind: "thisMonth" } });
    expect(
      toAssistantQuery({
        classification: "query",
        intent: "top_category",
        period: { kind: "last_year" },
      }),
    ).toEqual({ intent: "topCategory", category: null, period: { kind: "lastYear" } });
    expect(
      toAssistantQuery({
        classification: "query",
        intent: "lowest_category",
        period: { kind: "all_time" },
      }),
    ).toEqual({ intent: "lowestCategory", category: null, period: { kind: "allTime" } });
    expect(
      toAssistantQuery({
        classification: "query",
        intent: "transaction_count",
        period: { kind: "this_month" },
      }),
    ).toEqual({
      intent: "transactionCount",
      category: null,
      period: { kind: "thisMonth" },
    });
    expect(
      toAssistantQuery({
        classification: "query",
        intent: "expense_impact",
        period: { kind: "this_year" },
        dimension: "category",
      }),
    ).toEqual({
      intent: "expenseImpact",
      category: null,
      period: { kind: "thisYear" },
    });
    expect(
      toAssistantQuery({
        classification: "query",
        intent: "spending_distribution",
        period: { kind: "this_month" },
      }),
    ).toEqual({
      intent: "spendingDistribution",
      category: null,
      period: { kind: "thisMonth" },
    });
    expect(
      toAssistantQuery({
        classification: "query",
        intent: "income_vs_expenses",
        period: { kind: "this_year" },
      }),
    ).toEqual({
      intent: "incomeVsExpenses",
      category: null,
      period: { kind: "thisYear" },
    });
  });

  it("maps an explicit month, a category spend, and a comparison target", () => {
    expect(
      toAssistantQuery({
        classification: "query",
        intent: "category_spend",
        period: { kind: "month", month: 5, year: 2026 },
        entity: "Rent",
      }),
    ).toEqual({
      intent: "categorySpend",
      category: "Rent",
      period: { kind: "month", month: 5, year: 2026 },
    });
    expect(
      toAssistantQuery({
        classification: "query",
        intent: "period_comparison",
        period: { kind: "last_month" },
        target: "income",
      }),
    ).toEqual({
      intent: "periodComparison",
      category: null,
      target: "income",
      period: { kind: "lastMonth" },
    });
  });

  it("returns null for non-data structured intents", () => {
    expect(
      toAssistantQuery({ classification: "clarification", reason: "missing_metric" }),
    ).toBeNull();
    expect(
      toAssistantQuery({ classification: "unsupported", reason: "non_financial" }),
    ).toBeNull();
  });

  it("returns null (never throws) for anything malformed", () => {
    expect(toAssistantQuery(null)).toBeNull();
    expect(
      toAssistantQuery({ classification: "query", intent: "hack", period: { kind: "this_month" } }),
    ).toBeNull();
    expect(
      toAssistantQuery({
        classification: "query",
        intent: "expenses",
        period: { kind: "month", month: 12, year: 2026 },
      }),
    ).toBeNull();
    expect(toAssistantQuery("garbage")).toBeNull();
  });
});