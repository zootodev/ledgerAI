import { describe, expect, it } from "vitest";
import {
  answerFromMetrics,
  classifyAssistantQuestion,
  conversationTitle,
  parseAssistantQuestion,
  resolvePeriod,
  INSUFFICIENT_ANSWER,
  UNSUPPORTED_ANSWER,
  CLARIFICATION_ANSWER,
  type AssistantMetrics,
  type AssistantQuery,
} from "../../src/lib/finance/assistant";
import { summarizePeriod } from "../../src/lib/finance/engine";

const UTC = "2026-08-15T12:00:00.000Z";
const NOW = new Date(UTC);

function metrics(overrides: Partial<AssistantMetrics> = {}): AssistantMetrics {
  return {
    summary: summarizePeriod(1_000_000, 600_000, 0),
    priorSummary: summarizePeriod(800_000, 700_000, 0),
    categoryTotals: [
      { categoryName: "Rent", amount: 300_000, priorAmount: 280_000 },
      { categoryName: "Inventory", amount: 120_000, priorAmount: 90_000 },
    ],
    balance: 2_500_000,
    count: { income: 4, expenses: 5, transfers: 1 },
    ...overrides,
  };
}

function parse(q: string): AssistantQuery | null {
  return parseAssistantQuestion(q, NOW);
}

describe("parseAssistantQuestion", () => {
  it("returns null for an empty or gibberish question", () => {
    expect(parseAssistantQuestion("   ", NOW)).toBeNull();
    expect(parse("what is the weather like in space")).toBeNull();
  });

  it("detects a balance question", () => {
    expect(parse("What is my cash balance?")?.intent).toBe("balance");
    expect(parse("Do I have money in my account?")?.intent).toBe("balance");
  });

  it("detects income, expenses, and profit intents", () => {
    expect(parse("How much income did I earn?")?.intent).toBe("income");
    expect(parse("What were my expenses?")?.intent).toBe("expenses");
    expect(parse("Did I make a profit?")?.intent).toBe("profit");
    expect(parse("What is my net profit?")?.intent).toBe("profit");
  });

  it("detects the top category intent", () => {
    expect(parse("What was my top expense category?")?.intent).toBe("topCategory");
    expect(parse("Where did my money go?")?.intent).toBe("topCategory");
  });

  it("detects the lowest category intent", () => {
    expect(parse("Which category did I spend the least on?")?.intent).toBe(
      "lowestCategory",
    );
    expect(parse("What is my smallest expense category?")?.intent).toBe(
      "lowestCategory",
    );
    expect(parse("Where does my least money go?")?.intent).toBe("lowestCategory");
    expect(parse("What's the minimum spend category?")?.intent).toBe(
      "lowestCategory",
    );
    expect(parse("What do I spend the least money on?")?.intent).toBe(
      "lowestCategory",
    );
  });

  it("tolerates common typos (lest → least, wat → what)", () => {
    expect(parse("Which category did I spend the lest on?")?.intent).toBe(
      "lowestCategory",
    );
    expect(parse("Wat were my expenses?")?.intent).toBe("expenses");
  });

  it("resolves the comparative vs category precedence deliberately", () => {
    expect(parse("Most of my money goes to rent?")?.intent).toBe("topCategory");
    expect(parse("Did I spend the least on rent?")?.intent).toBe("lowestCategory");
    expect(parse("How much did I spend on software?")?.intent).toBe("categorySpend");
  });

  it("detects a category-spend intent with the canonical category", () => {
    const q = parse("How much did I spend on software?");
    expect(q?.intent).toBe("categorySpend");
    expect(q?.category).toBe("Software");
  });

  it("detects transaction-count intent", () => {
    expect(parse("How many transactions were there?")?.intent).toBe(
      "transactionCount",
    );
  });

  it("infers this month by default", () => {
    const q = parse("How much did I spend?");
    expect(q?.intent).toBe("expenses");
    expect(q?.period).toEqual({ kind: "thisMonth" });
  });

  it("resolves named months and years", () => {
    expect(parse("How much did I spend in June 2026?")?.period).toEqual({
      kind: "month",
      month: 5,
      year: 2026,
    });
  });

  it("resolves a bare month name to the current year", () => {
    expect(parse("How much did I spend in July?")?.period).toEqual({
      kind: "month",
      month: 6,
      year: 2026,
    });
  });
});

describe("resolvePeriod", () => {
  it("bounds this month and last month exactly (UTC)", () => {
    expect(resolvePeriod({ kind: "thisMonth" }, NOW)).toEqual({
      label: "August 2026",
      from: "2026-08-01",
      to: "2026-08-31",
    });
    expect(resolvePeriod({ kind: "lastMonth" }, NOW)).toEqual({
      label: "July 2026",
      from: "2026-07-01",
      to: "2026-07-31",
    });
  });

  it("bounds this year and all time", () => {
    expect(resolvePeriod({ kind: "thisYear" }, NOW)).toEqual({
      label: "2026",
      from: "2026-01-01",
      to: "2026-12-31",
    });
    expect(resolvePeriod({ kind: "allTime" }, NOW)).toEqual({
      label: "all time",
      from: null,
      to: null,
    });
  });

  it("rolls December back across the year boundary", () => {
    const jan = new Date("2026-01-15T00:00:00.000Z");
    expect(resolvePeriod({ kind: "lastMonth" }, jan)).toEqual({
      label: "December 2025",
      from: "2025-12-01",
      to: "2025-12-31",
    });
  });

  it("maps the valid explicit months 0 and 11 to January and December", () => {
    expect(resolvePeriod({ kind: "month", month: 0, year: 2026 }, NOW)).toEqual({
      label: "January 2026",
      from: "2026-01-01",
      to: "2026-01-31",
    });
    expect(resolvePeriod({ kind: "month", month: 11, year: 2026 }, NOW)).toEqual({
      label: "December 2026",
      from: "2026-12-01",
      to: "2026-12-31",
    });
  });

  it("guards out-of-range and non-integer months with a valid bounded fallback", () => {
    for (const month of [-1, 12, 13, 99]) {
      const r = resolvePeriod({ kind: "month", month, year: 2026 }, NOW);
      expect(r).toEqual({ label: "2026", from: "2026-01-01", to: "2026-12-31" });
      expect(new Date(`${r.from}T00:00:00.000Z`).toISOString()).toBeTruthy();
    }
    const nonInteger = resolvePeriod({ kind: "month", month: 3.5, year: 2026 }, NOW);
    expect(nonInteger).toEqual({ label: "2026", from: "2026-01-01", to: "2026-12-31" });
  });
});

describe("answerFromMetrics", () => {
  it("labels a partial prior range truthfully instead of calling it a whole month", () => {
    const answer = answerFromMetrics(
      {
        intent: "periodComparison",
        category: null,
        target: "expenses",
        period: { kind: "custom", from: "2026-09-02", to: "2026-10-01", label: "last 30 days" },
      },
      metrics({
        summary: summarizePeriod(900_000, 184_100, 0),
        priorSummary: summarizePeriod(800_000, 187_600, 0),
      }),
      "NGN",
      NOW,
    );

    expect(answer.text).toContain("August 3–September 1, 2026");
    expect(answer.text).not.toContain("Compared to August 2026");
  });

  it("compares against a verified zero when the explicit prior window has no activity", () => {
    const answer = answerFromMetrics(
      {
        intent: "periodComparison",
        category: null,
        target: "expenses",
        period: { kind: "thisMonth" },
        comparisonPeriod: { kind: "lastMonth" },
      },
      metrics({
        summary: summarizePeriod(510_000, 73_250, 0),
        priorSummary: summarizePeriod(0, 0, 0),
      }),
      "NGN",
      NOW,
    );

    expect(answer.kind).toBe("answer");
    expect(answer.text).toContain("₦0");
    expect(answer.text).toContain("July 2026");
  });

  it("answers a balance question from the cumulative figure", () => {
    const a = answerFromMetrics(
      { intent: "balance", category: null, period: { kind: "thisMonth" } },
      metrics(),
      "NGN",
      NOW,
    );
    expect(a.kind).toBe("answer");
    expect(a.text).toContain("2,500,000");
  });

  it("answers income with a versus prior-period delta", () => {
    const a = answerFromMetrics(
      { intent: "income", category: null, period: { kind: "thisMonth" } },
      metrics(),
      "NGN",
      NOW,
    );
    expect(a.kind).toBe("answer");
    expect(a.text).toContain("August 2026");
    expect(a.text).toContain("+25"); // (1,000,000-800,000)/800,000 = +25%
    expect(a.data.revenue).toBe(1_000_000);
  });

  it("answers expenses with the exact figure", () => {
    const a = answerFromMetrics(
      { intent: "expenses", category: null, period: { kind: "thisMonth" } },
      metrics(),
      "NGN",
      NOW,
    );
    expect(a.kind).toBe("answer");
    expect(a.text).toContain("600,000");
  });

  it("reports a loss rather than a profit when net is negative", () => {
    const m = metrics({
      summary: summarizePeriod(80_000, 100_000, 0),
      priorSummary: summarizePeriod(90_000, 60_000, 0),
    });
    const a = answerFromMetrics(
      { intent: "profit", category: null, period: { kind: "thisMonth" } },
      m,
      "NGN",
      NOW,
    );
    expect(a.kind).toBe("answer");
    expect(a.text.toLowerCase()).toContain("loss");
  });

  it("names the top category with its share of expenses", () => {
    const a = answerFromMetrics(
      { intent: "topCategory", category: null, period: { kind: "thisMonth" } },
      metrics({ summary: summarizePeriod(1_000_000, 600_000, 0) }),
      "NGN",
      NOW,
    );
    expect(a.kind).toBe("answer");
    expect(a.text).toContain("Rent");
    expect(a.text).toContain("50%"); // 300,000 / 600,000
    expect(a.data.categoryName).toBe("Rent");
  });

  it("names the lowest category from its recorded spend, ignoring zero activity", () => {
    const m = metrics({
      categoryTotals: [
        { categoryName: "Rent", amount: 300_000, priorAmount: 280_000 },
        { categoryName: "Inventory", amount: 120_000, priorAmount: 90_000 },
        { categoryName: "Software", amount: 0, priorAmount: 0 },
      ],
    });
    const a = answerFromMetrics(
      { intent: "lowestCategory", category: null, period: { kind: "thisMonth" } },
      m,
      "NGN",
      NOW,
    );
    expect(a.kind).toBe("answer");
    expect(a.text).toBe("You spent the least on Inventory, at ₦120,000, August 2026.");
    expect(a.data.amount).toBe(120_000);
  });

  it("lists every tied category for the lowest spend, alphabetically", () => {
    const m = metrics({
      categoryTotals: [
        { categoryName: "Utilities", amount: 25_000, priorAmount: 0 },
        { categoryName: "Software", amount: 25_000, priorAmount: 0 },
        { categoryName: "Rent", amount: 200_000, priorAmount: 0 },
      ],
    });
    const a = answerFromMetrics(
      { intent: "lowestCategory", category: null, period: { kind: "allTime" } },
      m,
      "NGN",
      NOW,
    );
    expect(a.kind).toBe("answer");
    expect(a.text).toBe(
      "You spent the least on Software and Utilities, at ₦25,000 each, all time.",
    );
    expect(a.data.categoryNames).toEqual(["Software", "Utilities"]);
  });

  it("returns insufficient when no expense category has activity", () => {
    const a = answerFromMetrics(
      { intent: "lowestCategory", category: null, period: { kind: "thisMonth" } },
      metrics({ categoryTotals: [] }),
      "NGN",
      NOW,
    );
    expect(a.kind).toBe("insufficient");
    expect(a.text).toBe(INSUFFICIENT_ANSWER);
  });

  it("answers category spend for the matched category", () => {
    const a = answerFromMetrics(
      { intent: "categorySpend", category: "Rent", period: { kind: "thisMonth" } },
      metrics(),
      "NGN",
      NOW,
    );
    expect(a.kind).toBe("answer");
    expect(a.text).toContain("300,000");
  });

  it("says no spending was recorded when the category is absent", () => {
    const a = answerFromMetrics(
      { intent: "categorySpend", category: "Food", period: { kind: "thisMonth" } },
      metrics(),
      "NGN",
      NOW,
    );
    expect(a.kind).toBe("answer");
    expect(a.text.toLowerCase()).toContain("no spending");
    expect(a.data.amount).toBe(0);
  });

  it("counts transactions across types", () => {
    const a = answerFromMetrics(
      { intent: "transactionCount", category: null, period: { kind: "thisMonth" } },
      metrics(),
      "NGN",
      NOW,
    );
    expect(a.kind).toBe("answer");
    expect(a.text).toContain("10 transactions");
    expect(a.data.total).toBe(10);
  });

  it("returns insufficient when the period has no data", () => {
    const m = metrics({
      summary: summarizePeriod(0, 0, 0),
      priorSummary: summarizePeriod(0, 0, 0),
      categoryTotals: [],
      balance: null,
      count: { income: 0, expenses: 0, transfers: 0 },
    });
    const a = answerFromMetrics(
      { intent: "expenses", category: null, period: { kind: "thisMonth" } },
      m,
      "NGN",
      NOW,
    );
    expect(a.kind).toBe("insufficient");
    expect(a.text).toBe(INSUFFICIENT_ANSWER);
  });

  it("returns insufficient when there is no stated balance to report", () => {
    const a = answerFromMetrics(
      { intent: "balance", category: null, period: { kind: "thisMonth" } },
      metrics({ balance: null }),
      "NGN",
      NOW,
    );
    expect(a.kind).toBe("insufficient");
  });

  it("omits the delta and never emits NaN/Infinity when the prior period is zero", () => {
    const m = metrics({
      summary: summarizePeriod(500_000, 300_000, 0),
      priorSummary: summarizePeriod(0, 0, 0),
    });
    const a = answerFromMetrics(
      { intent: "income", category: null, period: { kind: "thisMonth" } },
      m,
      "NGN",
      NOW,
    );
    expect(a.kind).toBe("answer");
    expect(a.text).toContain("500,000");
    expect(a.text).not.toContain("vs the prior period");
    expect(a.text).not.toContain("NaN");
    expect(a.text).not.toContain("Infinity");
    expect(a.text).not.toContain("%");
    expect(a.data.revenue).toBe(500_000);
  });
});

describe("conversationTitle", () => {
  it("derives a deterministic title for each intent", () => {
    expect(conversationTitle(parse("What is my cash balance?")!)).toBe(
      "Cash balance — This month",
    );
    expect(conversationTitle(parse("How much income did I earn this year?")!)).toBe(
      "Income — This year",
    );
    expect(conversationTitle(parse("How much did I spend last month?")!)).toBe(
      "Spending — Last month",
    );
    expect(conversationTitle(parse("Did I make a profit?")!)).toBe(
      "Profit — This month",
    );
    expect(conversationTitle(parse("What was my top expense category?")!)).toBe(
      "Top expense category — This month",
    );
    expect(
      conversationTitle(parse("Which category did I spend the least on?")!),
    ).toBe("Lowest expense category — This month");
    expect(conversationTitle(parse("How many transactions were there in June 2026?")!)).toBe(
      "Transaction count — June 2026",
    );
  });

  it("title-cases the category name", () => {
    expect(conversationTitle(parse("How much did I spend on software?")!)).toBe(
      "Software spending — This month",
    );
  });

  it("names the all-time window plainly", () => {
    expect(conversationTitle(parse("How much did I spend overall?")!)).toBe(
      "Spending — All time",
    );
  });

  it("never exceeds 60 characters", () => {
    const title = conversationTitle({ intent: "categorySpend", category: "Transportation", period: { kind: "month", month: 11, year: 2026 } });
    expect(title.length).toBeLessThanOrEqual(60);
  });

  it("truncates a pathologically long category name", () => {
    const title = conversationTitle({ intent: "categorySpend", category: "x".repeat(60), period: { kind: "allTime" } });
    expect(title.length).toBe(58); // 57 chars + the ellipsis
    expect(title.endsWith("…")).toBe(true);
  });
});

describe("capability surface", () => {
  it("offers an unsupported answer describing capabilities", () => {
    expect(UNSUPPORTED_ANSWER).toContain("balance");
    expect(UNSUPPORTED_ANSWER).toContain("profit");
  });

  it("offers a clarification answer that never demands specific numbers", () => {
    expect(CLARIFICATION_ANSWER).toContain("revenue");
    expect(CLARIFICATION_ANSWER).toContain("balance");
  });

  it("answers deterministically (same input, same output)", () => {
    const q: AssistantQuery = {
      intent: "income",
      category: null,
      period: { kind: "thisMonth" },
    };
    const m = metrics();
    const a = answerFromMetrics(q, m, "NGN", NOW);
    const b = answerFromMetrics(q, m, "NGN", NOW);
    expect(a).toEqual(b);
  });
});

describe("classifyAssistantQuestion", () => {
  it("classifies an answerable question as a query", () => {
    const c = classifyAssistantQuestion("How much did I spend?", NOW);
    expect(c.kind).toBe("query");
    if (c.kind === "query") expect(c.query.intent).toBe("expenses");
  });

  it("classifies vague financial questions as clarification", () => {
    for (const q of [
      "How did I do?",
      "How much was it?",
      "What happened?",
      "What are my numbers?",
      "How is my business doing?",
      "Give me a summary",
    ]) {
      const c = classifyAssistantQuestion(q, NOW);
      expect(c.kind, `expected clarification for "${q}"`).toBe("clarification");
    }
  });

  it("keeps explicit finance questions answerable even when they start vaguely", () => {
    const c = classifyAssistantQuestion("Give me a summary of my expenses", NOW);
    expect(c.kind).toBe("query");
    if (c.kind === "query") expect(c.query.intent).toBe("expenses");
  });

  it("classifies anything else as unsupported", () => {
    expect(classifyAssistantQuestion("What is the weather in Lagos?", NOW)).toEqual({
      kind: "unsupported",
    });
    expect(classifyAssistantQuestion("Who won the football match?", NOW)).toEqual({
      kind: "unsupported",
    });
    expect(classifyAssistantQuestion("   ", NOW)).toEqual({ kind: "unsupported" });
  });
});
