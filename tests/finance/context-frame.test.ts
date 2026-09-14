import { describe, expect, it } from "vitest";
import {
  answerFromMetrics,
  classifyFollowUp,
  SAVINGS_CLARIFICATION_ANSWER,
  type AssistantMetrics,
  type AssistantQuery,
} from "../../src/lib/finance/assistant";
import {
  buildContextFrame,
  periodFromNarrationLabel,
  readNarration,
  resolveAgainstFrames,
  shiftRangeBack,
  type FinancialContextFrame,
} from "../../src/lib/finance/context-frame";
import { summarizePeriod } from "../../src/lib/finance/engine";
import type { FollowUpAnalysis } from "../../src/lib/ask/understanding";

const NOW = new Date("2026-08-15T12:00:00.000Z");
const JULY: AssistantQuery["period"] = { kind: "month", month: 6, year: 2026 };
const AUGUST: AssistantQuery["period"] = { kind: "month", month: 7, year: 2026 };

function metrics(overrides: Partial<AssistantMetrics> = {}): AssistantMetrics {
  return {
    summary: summarizePeriod(1_000_000, 600_000, 0),
    priorSummary: null,
    categoryTotals: [
      { categoryName: "Rent", amount: 300_000, priorAmount: 280_000 },
      { categoryName: "Inventory", amount: 120_000, priorAmount: 90_000 },
      { categoryName: "Fuel", amount: 45_000, priorAmount: 40_000 },
    ],
    balance: 2_500_000,
    count: { income: 4, expenses: 5, transfers: 1 },
    ...overrides,
  };
}

function narrate(query: AssistantQuery, m: AssistantMetrics = metrics()): string {
  return answerFromMetrics(query, m, "NGN", NOW).text;
}

function frame(question: string, answer: string | null): FinancialContextFrame {
  return buildContextFrame({
    conversationId: "c1",
    businessId: "b1",
    question,
    answer,
    createdAt: "",
    exchangeIndex: 0,
    now: NOW,
  });
}

function fragment(question: string): FollowUpAnalysis {
  return classifyFollowUp(question, NOW);
}

function near(actual: number | null, expected: number, tolerance = 1): void {
  expect(actual).not.toBeNull();
  expect(Math.abs((actual as number) - expected)).toBeLessThanOrEqual(tolerance);
}

describe("readNarration — canonical template round-trips", () => {
  it("recovers income and expenses with their period labels", () => {
    const m = metrics({
      summary: summarizePeriod(820_000, 410_500, 0),
    });
    const income = readNarration(
      narrate({ intent: "income", category: null, period: JULY }, m),
      "income",
    );
    near(income.total, 820_000);
    expect(income.periodLabel).toBe("July 2026");

    const expenses = readNarration(
      narrate({ intent: "expenses", category: null, period: JULY }, m),
      "expenses",
    );
    near(expenses.total, 410_500);
    expect(expenses.periodLabel).toBe("July 2026");
  });

  it("recovers profit and a loss as a negative total", () => {
    const gained = readNarration(
      narrate({ intent: "profit", category: null, period: JULY }),
      "profit",
    );
    near(gained.total, 400_000);
    expect(gained.periodLabel).toBe("July 2026");

    const m = metrics({ summary: summarizePeriod(400_000, 500_000, 0) });
    const loss = readNarration(
      narrate({ intent: "profit", category: null, period: JULY }, m),
      "profit",
    );
    near(loss.total, -100_000);
    expect(loss.periodLabel).toBe("July 2026");
  });

  it("recovers balance, profit margin, and income-vs-expenses", () => {
    const balance = readNarration(
      narrate({ intent: "balance", category: null, period: JULY }),
      "balance",
    );
    near(balance.total, 2_500_000);
    expect(balance.metric).toBe("balance");

    const margin = readNarration(
      narrate({ intent: "profitMargin", category: null, period: JULY }),
      "profitMargin",
    );
    near(margin.total, 400_000);
    expect(margin.periodLabel).toBe("July 2026");

    const m = metrics({ summary: summarizePeriod(700_000, 300_000, 0) });
    const ive = readNarration(
      narrate({ intent: "incomeVsExpenses", category: null, period: JULY }, m),
      "incomeVsExpenses",
    );
    near(ive.total, 400_000);
    expect(ive.periodLabel).toBe("July 2026");
  });

  it("recovers a category total, its name, and the cited top category", () => {
    const spend = readNarration(
      narrate({ intent: "categorySpend", category: "rent", period: JULY }),
      "categorySpend",
    );
    near(spend.total, 300_000);
    expect(spend.categoryName).toBe("Rent");
    expect(spend.periodLabel).toBe("July 2026");

    const top = readNarration(
      narrate({ intent: "topCategory", category: null, period: JULY }),
      "topCategory",
    );
    near(top.total, 300_000);
    expect(top.categoryName).toBe("Rent");
  });

  it("recovers the lowest category and the spending-distribution label", () => {
    const least = readNarration(
      narrate({ intent: "lowestCategory", category: null, period: JULY }),
      "lowestCategory",
    );
    near(least.total, 45_000);

    const m = metrics({
      categoryTotals: [1, 2, 3, 4, 5, 6, 7].map((n) => ({
        categoryName: `Category${n}`,
        amount: n * 10_000,
        priorAmount: 0,
      })),
      summary: summarizePeriod(1_000_000, 1_200_000, 0),
    });
    const dist = readNarration(
      narrate({ intent: "spendingDistribution", category: null, period: JULY }, m),
      "spendingDistribution",
    );
    expect(dist.periodLabel).toBe("July 2026");
    near(dist.total, 1_200_000);
  });

  it("recovers an anchored breakdown total and the generic fallback", () => {
    const breakdown = narrate(
      {
        intent: "expenseBreakdown",
        category: null,
        period: AUGUST,
        amountReference: { value: 600_000, source: "previous_answer" },
      },
      metrics({ summary: summarizePeriod(0, 600_000, 0) }),
    );
    const read = readNarration(breakdown, "expenseBreakdown");
    near(read.total, 600_000);
    expect(read.periodLabel).toBe("August 2026");

    // The generic fallback (used for clarification frames that still cite a
    // spending total) parses the same breakdown template without an intent.
    const generic = readNarration(breakdown, null);
    expect(generic.metric).toBe("expenses");
    near(generic.total, 600_000);
  });
});

describe("buildContextFrame period chain", () => {
  it("prefers the classified query period", () => {
    const f = frame(
      "How much did I spend on rent last month?",
      "Spending on rent in July 2026 was ₦300,000.",
    );
    expect(f.query?.intent).toBe("categorySpend");
    expect(f.period?.kind).toBe("lastMonth");
    expect(f.classification).toBe("answer");
  });

  it("falls back to the narration label, then the question, then savings default", () => {
    // A clarification frame has no query, so the period chain reads the label
    // from our own cited narration ("August 2026").
    const fromNarration = frame(
      "How much did I spend the 187600 on?",
      "Of the ₦187,600 you asked about in August 2026, Rent (₦180,000) and Inventory (₦120,000) accounted for 100% of all expenses.",
    );
    expect(fromNarration.query).toBeNull();
    expect(fromNarration.clarificationReason).toBe("ambiguous_amount");
    expect(fromNarration.period).toEqual({ kind: "month", month: 7, year: 2026 });
    expect(periodFromNarrationLabel(fromNarration.reported.periodLabel)).toEqual({
      kind: "month",
      month: 7,
      year: 2026,
    });

    const fromQuestion = frame("What was my balance last year?", null);
    expect(fromQuestion.period?.kind).toBe("lastYear");

    const savings = frame("How much did I save last month?", SAVINGS_CLARIFICATION_ANSWER);
    expect(savings.classification).toBe("clarification");
    expect(savings.clarificationReason).toBe("ambiguous_savings");
    expect(savings.period?.kind).toBe("lastMonth");
  });
});

describe("resolveAgainstFrames", () => {
  it("resolves 'spend on it' only from the preceding owned category query", () => {
    const f = frame(
      "How much did I spend on rent last month?",
      "Spending on rent in July 2026 was ₦300,000.",
    );
    const resolution = resolveAgainstFrames(
      "How much did I spend on it?",
      fragment("How much did I spend on it?"),
      [f],
      NOW,
    );
    expect(resolution.kind).toBe("resolved");
    if (resolution.kind !== "resolved") return;
    expect(resolution.query).toMatchObject({
      intent: "categorySpend",
      category: "Rent",
      period: { kind: "lastMonth" },
    });
  });

  it("resolves higher-or-lower only after an owned period comparison", () => {
    const f = frame(
      "How did my expenses this month compare to last month?",
      "Compared to July 2026, your expenses went from ₦91,875 to ₦73,250 (-20.3%).",
    );
    const resolution = resolveAgainstFrames(
      "Was that higher or lower?",
      fragment("Was that higher or lower?"),
      [f],
      NOW,
    );
    expect(resolution.kind).toBe("resolved");
    if (resolution.kind !== "resolved") return;
    expect(resolution.query).toMatchObject({
      intent: "periodComparison",
      target: "expenses",
      period: { kind: "thisMonth" },
      comparisonPeriod: { kind: "lastMonth" },
    });
  });

  it("inherits intent and category for a period-only follow-up", () => {
    const f = frame(
      "How much did I spend on rent?",
      "Spending on rent in July 2026 was ₦300,000.",
    );
    const resolution = resolveAgainstFrames(
      "What about this month?",
      fragment("What about this month?"),
      [f],
      NOW,
    );
    expect(resolution.kind).toBe("resolved");
    if (resolution.kind !== "resolved") return;
    expect(resolution.query.intent).toBe("categorySpend");
    expect(resolution.query.category).toBe("Rent");
    expect(resolution.query.period?.kind).toBe("thisMonth");
  });

  it("maps 'what about before?' to a custom prior window labelled from the period", () => {
    const f = frame(
      "How much did I spend last month?",
      "Spending in July 2026 was ₦410,500.",
    );
    const resolution = resolveAgainstFrames(
      "What about before?",
      fragment("What about before?"),
      [f],
      NOW,
    );
    expect(resolution.kind).toBe("resolved");
    if (resolution.kind !== "resolved") return;
    expect(resolution.query.period).toMatchObject({
      kind: "custom",
      label: "June 2026",
    });
  });

  it("gives a hypothetical its prior period and a profit goal default", () => {
    const f = frame(
      "Did I make a profit last month?",
      "Net profit in July 2026 was ₦400,000.",
    );
    const resolution = resolveAgainstFrames(
      "What if I spent ₦50,000 less?",
      fragment("What if I spent ₦50,000 less?"),
      [f],
      NOW,
    );
    expect(resolution.kind).toBe("resolved");
    if (resolution.kind !== "resolved") return;
    expect(resolution.query.intent).toBe("expenseImpact");
    expect(resolution.query.mode).toBe("hypothetical");
    expect(resolution.query.effectGoal).toBe("profit");
    expect(resolution.query.hypotheticalAmount).toBe(50_000);
  });

  it("inherits a hypothetical category from the cited narration", () => {
    const f = frame(
      "What did I spend the most on last month?",
      "Your top expense category in July 2026 was Rent at ₦300,000 — 73.2% of all expenses.",
    );
    const resolution = resolveAgainstFrames(
      "What if I reduced that by ₦50,000?",
      fragment("What if I reduced that by ₦50,000?"),
      [f],
      NOW,
    );
    expect(resolution.kind).toBe("resolved");
    if (resolution.kind !== "resolved") return;
    expect(resolution.query.category).toBe("Rent");
  });

  it("anchors an exact cited total", () => {
    const f = frame(
      "How much did I spend in August 2026?",
      "Spending in August 2026 was ₦187,600.",
    );
    const resolution = resolveAgainstFrames(
      "What was that amount spent on?",
      fragment("What was that amount spent on?"),
      [f],
      NOW,
    );
    expect(resolution.kind).toBe("resolved");
    if (resolution.kind !== "resolved") return;
    expect(resolution.query.intent).toBe("expenseBreakdown");
    expect(resolution.query.amountReference).toEqual({
      value: 187_600,
      source: "previous_answer",
    });
  });

  it("refuses a cited total that does not match within the engine tolerance", () => {
    const f = frame(
      "How much did I spend in August 2026?",
      "Spending in August 2026 was ₦187,600.",
    );
    const resolution = resolveAgainstFrames(
      "What did I spend 150000 on?",
      fragment("What did I spend 150,000 on?"),
      [f],
      NOW,
    );
    expect(resolution.kind).toBe("none");
  });

  it("never anchors a register-only reference on a profit total", () => {
    const f = frame(
      "Did I make a profit last month?",
      "Net profit in July 2026 was ₦400,000.",
    );
    const resolution = resolveAgainstFrames(
      "What was that amount spent on?",
      fragment("What was that amount spent on?"),
      [f],
      NOW,
    );
    expect(resolution.kind).toBe("none");
  });

  it("resolves 'Both' only against an owned ambiguous-savings clarification", () => {
    const savings = frame("How much did I save last month?", SAVINGS_CLARIFICATION_ANSWER);
    const chosen = resolveAgainstFrames("Both", fragment("Both"), [savings], NOW);
    expect(chosen.kind).toBe("savingsSelection");
    if (chosen.kind !== "savingsSelection") return;
    expect(chosen.period?.kind).toBe("lastMonth");

    const unrelated = frame(
      "Did I make a profit last month?",
      "Net profit in July 2026 was ₦400,000.",
    );
    expect(resolveAgainstFrames("Both", fragment("Both"), [unrelated], NOW).kind).toBe(
      "none",
    );
  });

  it("returns none for every fragment kind without any owned context", () => {
    for (const q of [
      "What about last month?",
      "What about before?",
      "What if I spent ₦50,000 less?",
      "What was that amount spent on?",
    ]) {
      expect(resolveAgainstFrames(q, fragment(q), [], NOW).kind).toBe("none");
    }
  });
});

describe("helpers", () => {
  it("shiftRangeBack moves the window back by exactly one span", () => {
    expect(shiftRangeBack("2026-08-01", "2026-08-31")).toEqual([
      "2026-07-01",
      "2026-07-31",
    ]);
    expect(shiftRangeBack("2026-01-01", "2026-12-31")).toEqual([
      "2025-01-01",
      "2025-12-31",
    ]);
  });

  it("periodFromNarrationLabel parses our own label formats", () => {
    expect(periodFromNarrationLabel("August 2026")).toEqual({
      kind: "month",
      month: 7,
      year: 2026,
    });
    expect(periodFromNarrationLabel("2026")?.kind).toBe("custom");
    expect(periodFromNarrationLabel("all time")?.kind).toBe("allTime");
    expect(periodFromNarrationLabel("last 30 days")).toEqual({
      kind: "recent",
      days: 30,
    });
    expect(periodFromNarrationLabel("not a label")).toBeNull();
  });

  it("round-trips narration for every reader deterministically (no drift)", () => {
    const mulberry32 = (seed: number) => {
      let a = seed >>> 0;
      return () => {
        a += 0x6d2b79f5;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    };

    for (const seed of [1, 7, 42, 999, 20260815]) {
      const rng = mulberry32(seed);
      const revenue = 1_000_000 + Math.floor(rng() * 9_000_000);
      const expenses = Math.max(1, Math.floor(rng() * 800_000));
      const balance = 500_000 + Math.floor(rng() * 8_000_000);
      const m = metrics({
        summary: summarizePeriod(revenue, expenses, 0),
        balance,
        categoryTotals: [
          { categoryName: "Rent", amount: Math.max(1, Math.floor(rng() * 500_000)), priorAmount: 0 },
          { categoryName: "Inventory", amount: Math.max(1, Math.floor(rng() * 500_000)), priorAmount: 0 },
          { categoryName: "Fuel", amount: Math.max(1, Math.floor(rng() * 500_000)), priorAmount: 0 },
          { categoryName: "Software", amount: Math.max(1, Math.floor(rng() * 500_000)), priorAmount: 0 },
          { categoryName: "Transport", amount: Math.max(1, Math.floor(rng() * 500_000)), priorAmount: 0 },
          { categoryName: "Power", amount: Math.max(1, Math.floor(rng() * 500_000)), priorAmount: 0 },
          { categoryName: "Labor", amount: Math.max(1, Math.floor(rng() * 500_000)), priorAmount: 0 },
        ],
      });

      const income = readNarration(
        narrate({ intent: "income", category: null, period: JULY }, m),
        "income",
      );
      near(income.total, revenue);

      const spent = readNarration(
        narrate({ intent: "expenses", category: null, period: JULY }, m),
        "expenses",
      );
      near(spent.total, expenses);

      const profit = readNarration(
        narrate({ intent: "profit", category: null, period: JULY }, m),
        "profit",
      );
      near(profit.total, revenue - expenses);

      const margin = readNarration(
        narrate({ intent: "profitMargin", category: null, period: JULY }, m),
        "profitMargin",
      );
      near(margin.total, revenue - expenses);

      const bal = readNarration(
        narrate({ intent: "balance", category: null, period: JULY }, m),
        "balance",
      );
      near(bal.total, balance);

      const rent = readNarration(
        narrate({ intent: "categorySpend", category: "rent", period: JULY }, m),
        "categorySpend",
      );
      near(rent.total, m.categoryTotals[0].amount, 1);

      const top = readNarration(
        narrate({ intent: "topCategory", category: null, period: JULY }, m),
        "topCategory",
      );
      near(top.total, m.categoryTotals[0].amount, 1);

      const least = readNarration(
        narrate({ intent: "lowestCategory", category: null, period: JULY }, m),
        "lowestCategory",
      );
      near(least.total, Math.min(...m.categoryTotals.map((c) => c.amount)), 1);

      const dist = readNarration(
        narrate({ intent: "spendingDistribution", category: null, period: JULY }, m),
        "spendingDistribution",
      );
      near(dist.total, expenses);

      const ive = readNarration(
        narrate({ intent: "incomeVsExpenses", category: null, period: JULY }, m),
        "incomeVsExpenses",
      );
      near(ive.total, revenue - expenses);

      const breakdown = readNarration(
        narrate(
          {
            intent: "expenseBreakdown",
            category: null,
            period: JULY,
            amountReference: { value: expenses, source: "previous_answer" },
          },
          m,
        ),
        "expenseBreakdown",
      );
      near(breakdown.total, expenses);
    }
  });
});
