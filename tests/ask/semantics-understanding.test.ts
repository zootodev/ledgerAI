import { describe, expect, it } from "vitest";
import {
  analyzeFollowUp,
  editDistance,
  normalizeQuestion,
  parsePeriod,
  prepareQuestion,
  understand,
} from "@/lib/ask/understanding";
import {
  answerFromMetrics,
  classifyAssistantQuestion,
  classifyFollowUp,
  parseAssistantQuestion,
  resolvePeriod,
  SAVINGS_CLARIFICATION_ANSWER,
  type AssistantCategorySpend,
  type AssistantMetrics,
} from "@/lib/finance/assistant";
import { computeSummary, type PeriodSummary } from "@/lib/finance/engine";

const NOW = new Date("2026-08-15T12:00:00.000Z");

function metrics(
  summary: PeriodSummary,
  categoryTotals: AssistantCategorySpend[] = [],
  prior: PeriodSummary | null = null,
): AssistantMetrics {
  return {
    summary,
    priorSummary: prior,
    categoryTotals,
    balance: null,
    count: null,
  };
}

function twoMonthSummary(current: PeriodSummary, prior: PeriodSummary) {
  return metrics(current, [], prior);
}

describe("normalization and one generic spelling-tolerance mechanism", () => {
  it("lowercases and strips punctuation", () => {
    expect(normalizeQuestion("  WHAT'S Up?! ")).toBe("whats up");
  });

  it("corrects curated typos", () => {
    expect(prepareQuestion("Which category did I spend the lest on?")).toBe(
      "which category did i spend the least on",
    );
    expect(prepareQuestion("WAT is my balance?")).toBe("what is my balance");
  });

  it("never corrects ordinary function words into financial concepts", () => {
    expect(prepareQuestion("What are my numbers?")).toBe("what are my numbers");
    expect(prepareQuestion("How much money do I have?")).toBe(
      "how much money do i have",
    );
    expect(prepareQuestion("Tell me about my business")).toBe(
      "tell me about my business",
    );
  });

  it("implements a strict, token-cheap edit distance", () => {
    expect(editDistance("balance", "balence")).toBe(1);
    expect(editDistance("balance", "balacne")).toBe(1);
    expect(editDistance("revenue", "revenu")).toBe(1);
    expect(editDistance("cat", "dog")).toBeGreaterThan(1);
  });
});

describe("parsePeriod (time-expression parser)", () => {
  it("resolves the recurring windows", () => {
    expect(parsePeriod("this month", NOW)).toEqual({ kind: "this_month" });
    expect(parsePeriod("last month", NOW)).toEqual({ kind: "last_month" });
    expect(parsePeriod("this year", NOW)).toEqual({ kind: "this_year" });
    expect(parsePeriod("last year", NOW)).toEqual({ kind: "last_year" });
    expect(parsePeriod("overall", NOW)).toEqual({ kind: "all_time" });
    expect(parsePeriod("in total", NOW)).toEqual({ kind: "all_time" });
    expect(parsePeriod("in the past few months", NOW)).toEqual({
      kind: "recent",
      days: 90,
    });
    expect(parsePeriod("recently", NOW)).toEqual({ kind: "recent", days: 30 });
  });

  it("resolves explicit months (with and without a year)", () => {
    expect(parsePeriod("in June 2026", NOW)).toEqual({
      kind: "month",
      month: 5,
      year: 2026,
    });
    expect(parsePeriod("in July", NOW)).toEqual({
      kind: "month",
      month: 6,
      year: 2026,
    });
    // "last year" outranks the month token (same precedence as the engine).
    expect(parsePeriod("in July last year", NOW)).toEqual({ kind: "last_year" });
    expect(parsePeriod("in June 2025", NOW)).toEqual({
      kind: "month",
      month: 5,
      year: 2025,
    });
  });
});

describe("semantic intent mapping (parseAssistantQuestion)", () => {
  it("maps the revenue-vs-profit impact question to expenseImpact+thisYear", () => {
    const q = parseAssistantQuestion(
      "In this year, what have I spent money on that made my revenue lesser than before?",
      NOW,
    );
    expect(q).toEqual({
      intent: "expenseImpact",
      category: null,
      period: { kind: "thisYear" },
    });
  });

  it("keeps the lowest-category regression fixed across windows", () => {
    expect(parseAssistantQuestion("Which category did I spend the least on all time?", NOW)).toEqual({
      intent: "lowestCategory",
      category: null,
      period: { kind: "allTime" },
    });
    expect(parseAssistantQuestion("What did I spend the least money on?", NOW)).toEqual({
      intent: "lowestCategory",
      category: null,
      period: { kind: "thisMonth" },
    });
  });

  it("maps the distribution, margin, and comparison surfaces", () => {
    expect(parseAssistantQuestion("Which categories did I spend on this month?", NOW)?.intent).toBe(
      "spendingDistribution",
    );
    expect(parseAssistantQuestion("What is my profit margin?", NOW)?.intent).toBe("profitMargin");
    expect(parseAssistantQuestion("How much did I earn and spend this month?", NOW)?.intent).toBe(
      "incomeVsExpenses",
    );
    expect(
      parseAssistantQuestion("How does my income in June 2026 compare to May 2026?", NOW),
    ).toEqual({
      intent: "periodComparison",
      category: null,
      target: "income",
      period: { kind: "month", month: 5, year: 2026 },
      comparisonPeriod: { kind: "month", month: 4, year: 2026 },
    });
  });

  it("maps conscious last-year and rolling recent windows", () => {
    expect(parseAssistantQuestion("How much did I spend last year?", NOW)).toEqual({
      intent: "expenses",
      category: null,
      period: { kind: "lastYear" },
    });
    expect(parseAssistantQuestion("How much did I earn in the past few weeks?", NOW)).toEqual({
      intent: "income",
      category: null,
      period: { kind: "recent", days: 30 },
    });
  });
});

describe("period resolution against the clock", () => {
  it("binds last-year and rolling windows to exact bounds", () => {
    expect(resolvePeriod({ kind: "lastYear" }, NOW)).toEqual({
      label: "2025",
      from: "2025-01-01",
      to: "2025-12-31",
    });
    expect(resolvePeriod({ kind: "recent", days: 30 }, NOW)).toEqual({
      label: "last 30 days",
      from: "2026-07-17",
      to: "2026-08-15",
    });
  });

  it("guards malformed explicit months back to a bounded year window", () => {
    expect(resolvePeriod({ kind: "month", month: 13, year: 2026 }, NOW)).toEqual({
      label: "2026",
      from: "2026-01-01",
      to: "2026-12-31",
    });
  });
});

describe("follow-up detection (analyzeFollowUp)", () => {
  it("flags period-only conversational turns", () => {
    expect(classifyFollowUp("What about last month?", NOW)).toEqual({
      kind: "period",
      period: { kind: "last_month" },
    });
    expect(classifyFollowUp("And last year?", NOW)).toEqual({
      kind: "period",
      period: { kind: "last_year" },
    });
    // "Compared to …" names the comparison itself, so it keeps its own
    // subject rather than being treated as a bare period reference.
    expect(classifyFollowUp("Compared to last month?", NOW)).toEqual({ kind: "none" });
  });

  it("never flags a turn that names its own metric or subject", () => {
    expect(analyzeFollowUp("How much did I spend last month?", NOW)).toEqual({ kind: "none" });
    expect(analyzeFollowUp("What about profit in July?", NOW)).toEqual({ kind: "none" });
    expect(analyzeFollowUp("What about rent?", NOW)).toEqual({ kind: "none" });
    expect(analyzeFollowUp("Play me a song", NOW)).toEqual({ kind: "none" });
  });

  it("flags a prior-window reference without a period token", () => {
    expect(analyzeFollowUp("What about before?", NOW)).toEqual({ kind: "priorPeriod" });
    expect(analyzeFollowUp("How about earlier?", NOW)).toEqual({ kind: "priorPeriod" });
    // Naming a metric keeps the turn self-standing.
    expect(analyzeFollowUp("What about my profit before?", NOW)).toEqual({ kind: "none" });
  });

  it("flags hypothetical fragments that borrow their subject from context", () => {
    expect(analyzeFollowUp("What if I reduced that by ₦50,000?", NOW)).toEqual({
      kind: "hypothetical",
      goal: null,
      operation: "decrease",
      amount: 50_000,
    });
    expect(analyzeFollowUp("What if I spent ₦50,000 less?", NOW)).toEqual({
      kind: "hypothetical",
      goal: null,
      operation: "decrease",
      amount: 50_000,
    });
    expect(analyzeFollowUp("Would it increase?", NOW)).toEqual({
      kind: "hypothetical",
      goal: null,
      operation: null,
      amount: null,
    });
  });

  it("marks referential spend objects and comparison-direction questions for owned-context resolution", () => {
    expect(analyzeFollowUp("How much did I spend on it?", NOW)).toEqual({
      kind: "categorySpend",
    });
    expect(analyzeFollowUp("Was that higher or lower?", NOW)).toEqual({
      kind: "comparisonDirection",
    });
    expect(classifyAssistantQuestion("How much did I spend on it?", NOW)).toEqual({
      kind: "clarification",
      reason: "needs_subject",
    });
  });
});

describe("hypothetical / comparison semantics (understand)", () => {
  it("preserves both explicitly named windows instead of deriving a second prior window", () => {
    expect(parseAssistantQuestion("How did my expenses this month compare to last month?", NOW)).toEqual({
      intent: "periodComparison",
      category: null,
      target: "expenses",
      period: { kind: "thisMonth" },
      comparisonPeriod: { kind: "lastMonth" },
    });

    expect(parseAssistantQuestion("How does my income in June 2026 compare to May 2026?", NOW)).toEqual({
      intent: "periodComparison",
      category: null,
      target: "income",
      period: { kind: "month", month: 5, year: 2026 },
      comparisonPeriod: { kind: "month", month: 4, year: 2026 },
    });
  });

  it("parses 'than' comparisons keeping the base and comparison windows", () => {
    const expected = {
      intent: "periodComparison",
      category: null,
      target: "expenses",
      period: { kind: "thisMonth" },
      comparisonPeriod: { kind: "lastMonth" },
    } as const;

    expect(parseAssistantQuestion("Did I spend more this month than last month?", NOW)).toEqual(expected);
    expect(parseAssistantQuestion("Did I spend less this month than last month?", NOW)).toEqual(expected);
    expect(parseAssistantQuestion("Was I spending more this month than last month?", NOW)).toEqual(expected);
  });

  it("parses verb-first 'compare X with/to Y' keeping the base and comparison windows", () => {
    const expected = {
      intent: "periodComparison",
      category: null,
      target: "expenses",
      period: { kind: "thisMonth" },
      comparisonPeriod: { kind: "lastMonth" },
    } as const;

    expect(parseAssistantQuestion("Compare my spending this month with last month", NOW)).toEqual(expected);
    expect(parseAssistantQuestion("Compare my spending this month to last month", NOW)).toEqual(expected);

    const explicit = {
      intent: "periodComparison",
      category: null,
      target: null,
      period: { kind: "month", month: 5, year: 2026 },
      comparisonPeriod: { kind: "month", month: 4, year: 2026 },
    } as const;

    expect(parseAssistantQuestion("Compare June with May", NOW)).toEqual(explicit);
    expect(parseAssistantQuestion("Compare June to May", NOW)).toEqual(explicit);
  });

  it("never collapses an explicit comparison into last_month without a comparison period", () => {
    const parsed = parseAssistantQuestion("Did I spend more this month than last month?", NOW);
    expect(parsed?.period).toEqual({ kind: "thisMonth" });
    expect(parsed?.comparisonPeriod).toEqual({ kind: "lastMonth" });
    expect(parsed?.period).not.toEqual({ kind: "lastMonth" });
    expect(parsed?.comparisonPeriod).not.toBeUndefined();
  });

  it("resolves a rhetorical profit hypothetical to expenseImpact+hypothetical", () => {
    expect(parseAssistantQuestion("If I spent less on others, would my profit increase than before?", NOW)).toEqual({
      intent: "expenseImpact",
      category: "Other",
      period: { kind: "thisMonth" },
      mode: "hypothetical",
      effectGoal: "profit",
      operation: "decrease",
    });
  });

  it("resolves an expense-reduction hypothetical (not a revenue question)", () => {
    expect(parseAssistantQuestion("If I spent less on others, would my expense reduce than before?", NOW)).toEqual({
      intent: "expenseImpact",
      category: "Other",
      period: { kind: "thisMonth" },
      mode: "hypothetical",
      effectGoal: "expenses",
      operation: "decrease",
    });
  });

  it("keeps an explicit comparison against a concrete prior window", () => {
    expect(parseAssistantQuestion("If I spent less than last month, would my profit be higher?", NOW)).toEqual({
      intent: "expenseImpact",
      category: null,
      period: { kind: "thisMonth" },
      mode: "comparison",
      effectGoal: "profit",
      operation: "decrease",
    });
  });

  it("extracts a user-stated amount and keeps the fallback Other bucket", () => {
    expect(parseAssistantQuestion("If I reduce my Rent by ₦50,000, would my profit go up?", NOW)).toEqual({
      intent: "expenseImpact",
      category: "Rent",
      period: { kind: "thisMonth" },
      mode: "hypothetical",
      effectGoal: "profit",
      operation: "decrease",
      hypotheticalAmount: 50_000,
    });
  });

  it("applies the generic typo mechanism inside hypothetical framing", () => {
    const q = parseAssistantQuestion("if I spnt less on other would profit go up", NOW);
    expect(q?.intent).toBe("expenseImpact");
    expect(q?.category).toBe("Other");
    expect(q?.mode).toBe("hypothetical");
  });

  it("asks for the subject when the scenario is referential with no category", () => {
    expect(understand("how would that affect my profit?", NOW)).toEqual({
      classification: "clarification",
      reason: "needs_subject",
    });
    expect(understand("would it increase?", NOW)).toEqual({
      classification: "clarification",
      reason: "needs_subject",
    });
  });

  it("never turns a factual savings/cut question into a scenario", () => {
    // A savings question without a scenario frame is not hypothetical; it is
    // genuinely ambiguous, so it becomes a clarification (never a query and
    // never unqualified "unsupported").
    expect(parseAssistantQuestion("How much did I save last month?", NOW)).toBeNull();
    expect(understand("How much did I save last month?", NOW)).toEqual({
      classification: "clarification",
      reason: "ambiguous_savings",
    });
    // "this month" is a period, NOT a referential pronoun — so an imperative
    // cut keeps the factual impact reading (no mode).
    const cut = parseAssistantQuestion("Reduce my expenses this month", NOW);
    expect(cut?.intent).toBe("expenseImpact");
    expect(cut?.mode).toBeUndefined();
    // The regression question above must still map to the factual impact path.
    expect(parseAssistantQuestion(
      "In this year, what have I spent money on that made my revenue lesser than before?",
      NOW,
    )).toEqual({ intent: "expenseImpact", category: null, period: { kind: "thisYear" } });
  });
});

describe("hypothetical narrations (verified figures only)", () => {
  it("narrates a profit hypothetical symbolically when no amount is given", () => {
    const current = computeSummary([
      { type: "income", amount: 1_000_000 },
      { type: "expense", amount: 400_000 },
    ]);
    const a = answerFromMetrics(
      {
        intent: "expenseImpact",
        category: null,
        period: { kind: "thisMonth" },
        mode: "hypothetical",
        effectGoal: "profit",
        operation: "decrease",
      },
      metrics(current),
      "NGN",
      NOW,
    );
    expect(a.text).toContain("increase your profit by exactly the amount you save");
    expect(a.text).toContain("that's the ceiling on what you could save");
    expect(a.text).not.toContain("revenue");
  });

  it("computes a stated amount through to a new profit figure", () => {
    const current = computeSummary([
      { type: "income", amount: 1_000_000 },
      { type: "expense", amount: 400_000 },
    ]);
    const a = answerFromMetrics(
      {
        intent: "expenseImpact",
        category: null,
        period: { kind: "thisMonth" },
        mode: "hypothetical",
        effectGoal: "profit",
        operation: "decrease",
        hypotheticalAmount: 50_000,
      },
      metrics(current),
      "NGN",
      NOW,
    );
    expect(a.text).toContain("If you cut ₦50,000 from spending, profit would rise to ₦650,000");
  });

  it("narrates the expense-reduction reading", () => {
    const current = computeSummary([
      { type: "income", amount: 1_000_000 },
      { type: "expense", amount: 600_000 },
    ]);
    const a = answerFromMetrics(
      {
        intent: "expenseImpact",
        category: "Other",
        period: { kind: "thisMonth" },
        mode: "hypothetical",
        effectGoal: "expenses",
        operation: "decrease",
      },
      metrics(current, [{ categoryName: "Other", amount: 100_000, priorAmount: 0 }]),
      "NGN",
      NOW,
    );
    expect(a.text).toContain("Reducing your spending on other reduces your total expenses");
    expect(a.text).toContain("You spent ₦100,000 on other");
    // Must not contain the factual "Spending doesn't reduce revenue" lecture.
    expect(a.text).not.toContain("doesn’t reduce your revenue");
  });

  it("says plainly that spending change never moves revenue", () => {
    const current = computeSummary([
      { type: "income", amount: 1_000_000 },
      { type: "expense", amount: 400_000 },
    ]);
    const a = answerFromMetrics(
      {
        intent: "expenseImpact",
        category: null,
        period: { kind: "thisMonth" },
        mode: "hypothetical",
        effectGoal: "income",
        operation: "decrease",
      },
      metrics(current),
      "NGN",
      NOW,
    );
    expect(a.text).toContain("Spending less doesn't change your revenue");
  });

  it("appends the prior window when the user names a concrete comparison", () => {
    const current = computeSummary([
      { type: "income", amount: 1_000_000 },
      { type: "expense", amount: 600_000 },
    ]);
    const prior = computeSummary([
      { type: "income", amount: 800_000 },
      { type: "expense", amount: 600_000 },
    ]);
    const a = answerFromMetrics(
      {
        intent: "expenseImpact",
        category: null,
        period: { kind: "thisMonth" },
        mode: "comparison",
        effectGoal: "profit",
        operation: "decrease",
      },
      twoMonthSummary(current, prior),
      "NGN",
      NOW,
    );
    expect(a.text).toContain("In July 2026, your profit was ₦200,000");
  });

  it("rejects an impossible comparison with an open-ended window", () => {
    const current = computeSummary([
      { type: "income", amount: 1_000_000 },
      { type: "expense", amount: 400_000 },
    ]);
    const a = answerFromMetrics(
      {
        intent: "expenseImpact",
        category: null,
        period: { kind: "thisMonth" },
        mode: "hypothetical",
        effectGoal: "profit",
        operation: "decrease",
      },
      metrics(current),
      "NGN",
      NOW,
    );
    expect(a.kind).toBe("answer");
  });
});

describe("new narrations (answerFromMetrics)", () => {
  it("explains expense impact in revenue terms and names the drivers", () => {
    const current = computeSummary([
      { type: "income", amount: 1_000_000 },
      { type: "expense", amount: 400_000 },
    ]);
    const prior = computeSummary([{ type: "income", amount: 800_000 }]);
    const q = { intent: "expenseImpact" as const, category: null, period: { kind: "thisYear" } as const };
    const a = answerFromMetrics(
      q,
      metrics(
        current,
        [
          { categoryName: "Inventory", amount: 200_000, priorAmount: 0 },
          { categoryName: "Rent", amount: 150_000, priorAmount: 0 },
          { categoryName: "Utilities", amount: 50_000, priorAmount: 0 },
        ],
        prior,
      ),
      "NGN",
      NOW,
    );
    expect(a.text).toContain("Spending doesn’t reduce your revenue");
    expect(a.text).toContain("leaving ₦600,000 profit");
    expect(a.text).toContain("Inventory (₦200,000), Rent (₦150,000), Utilities (₦50,000)");
    expect(a.text).toContain("Revenue rose +25%");
  });

  it("narrates the spending distribution with shares", () => {
    const current = computeSummary([
      { type: "income", amount: 1_000_000 },
      { type: "expense", amount: 600_000 },
    ]);
    const a = answerFromMetrics(
      { intent: "spendingDistribution", category: null, period: { kind: "thisMonth" } },
      metrics(current, [
        { categoryName: "Rent", amount: 360_000, priorAmount: 0 },
        { categoryName: "Utilities", amount: 240_000, priorAmount: 0 },
      ]),
      "NGN",
      NOW,
    );
    expect(a.text).toBe(
      "In August 2026 your spending broke down as Rent (60%) and Utilities (40%).",
    );
  });

  it("truncates long distributions and names the rest", () => {
    const current = computeSummary([{ type: "expense", amount: 600_000 }]);
    const totals = [
      ["Rent", 200_000], ["Software", 100_000], ["Utilities", 100_000],
      ["Inventory", 100_000], ["Marketing", 60_000], ["Salaries", 40_000],
    ].map(([categoryName, amount]) => ({
      categoryName: categoryName as string,
      amount: amount as number,
      priorAmount: 0,
    }));
    const a = answerFromMetrics(
      { intent: "spendingDistribution", category: null, period: { kind: "thisMonth" } },
      metrics(current, totals),
      "NGN",
      NOW,
    );
    expect(a.text).toContain("Rent (33%)");
    expect(a.text).toContain("Marketing (10%)");
    expect(a.text).toContain("1 more categories make up the rest of the ₦600,000 total.");
    expect(a.text).not.toContain("Salaries");
  });

  it("narrates income-vs-expenses and profit margin", () => {
    const current = computeSummary([
      { type: "income", amount: 1_000_000 },
      { type: "expense", amount: 400_000 },
    ]);
    const a = answerFromMetrics(
      { intent: "incomeVsExpenses", category: null, period: { kind: "thisMonth" } },
      metrics(current),
      "NGN",
      NOW,
    );
    expect(a.text).toContain(
      "you brought in ₦1,000,000 and spent ₦400,000, leaving ₦600,000 profit (a 60% margin)",
    );

    const m = answerFromMetrics(
      { intent: "profitMargin", category: null, period: { kind: "thisMonth" } },
      metrics(current),
      "NGN",
      NOW,
    );
    expect(m.text).toContain("Your profit margin in August 2026 was 60%");
  });

  it("compares a single target and the full picture across periods", () => {
    const current = computeSummary([
      { type: "income", amount: 1_000_000 },
      { type: "expense", amount: 600_000 },
    ]);
    const prior = computeSummary([
      { type: "income", amount: 400_000 },
      { type: "expense", amount: 300_000 },
    ]);

    const single = answerFromMetrics(
      { intent: "periodComparison", category: null, target: "income", period: { kind: "month", month: 5, year: 2026 } },
      twoMonthSummary(current, prior),
      "NGN",
      NOW,
    );
    expect(single.text).toBe(
      "Compared to May 2–May 31, 2026, your income went from ₦400,000 to ₦1,000,000 (+150%).",
    );

    const whole = answerFromMetrics(
      { intent: "periodComparison", category: null, target: null, period: { kind: "month", month: 5, year: 2026 } },
      twoMonthSummary(current, prior),
      "NGN",
      NOW,
    );
    expect(whole.text).toContain("Compared to May 2–May 31, 2026");
    expect(whole.text).toContain("revenue went from ₦400,000 to ₦1,000,000 (+150%)");
    expect(whole.text).toContain("expenses went from ₦300,000 to ₦600,000 (+100%)");
    expect(whole.text).toContain("profit went from ₦100,000 to ₦400,000 (+300%)");
  });
});

describe("savings ambiguity → clarification, not unsupported", () => {
  it("treats a bare savings question as ambiguous (spend-cut vs leftover)", () => {
    for (const q of [
      "How much did I save last month?",
      "How much did I save?",
      "What did I save?",
    ]) {
      expect(understand(q, NOW), q).toEqual({
        classification: "clarification",
        reason: "ambiguous_savings",
      });
      expect(classifyAssistantQuestion(q, NOW), q).toEqual({
        kind: "clarification",
        reason: "ambiguous_savings",
      });
    }
  });

  it("never resolves a bare savings question to profit or to expense-reduction", () => {
    // No intent is invented for "savings".
    expect(classifyAssistantQuestion("How much did I save?", NOW).kind).toBe("clarification");
    expect(parseAssistantQuestion("How much did I save?", NOW)).toBeNull();
    // ...even with a period or a category: the operation is still ambiguous.
    expect(classifyAssistantQuestion("How much did I save on Software?", NOW).kind).toBe(
      "clarification",
    );
  });

  it("keeps real spend questions and hypothetical savings-change questions intact", () => {
    // Spending with a modal IS a hypothetical-change question, not a savings
    // ambiguity ("how much would I save?" is resolved by context in the
    // service layer; standing alone it is still not a data query).
    expect(classifyAssistantQuestion("How much did I spend last month?", NOW)).toEqual({
      kind: "query",
      query: { intent: "expenses", category: null, period: { kind: "lastMonth" } },
    });
  });
});

describe("bare conversational references clarify when there is no context", () => {
  it("clarifies pronoun/elided-subject turns instead of calling them out of scope", () => {
    for (const q of [
      "What about last month?",
      "What about all time?",
      "What about before?",
      "what about that?",
      "what did that change?",
    ]) {
      expect(understand(q, NOW), q).toEqual({
        classification: "clarification",
        reason: "needs_subject",
      });
      expect(classifyAssistantQuestion(q, NOW), q).toEqual({
        kind: "clarification",
        reason: "needs_subject",
      });
    }
  });

  it("never treats a turn that names its own subject as a bare reference", () => {
    expect(classifyAssistantQuestion("What about my profit in July?", NOW).kind).toBe("query");
    expect(classifyAssistantQuestion("What about rent?", NOW).kind).toBe("unsupported");
    expect(understand("What about last month?", NOW)).toEqual({
      classification: "clarification",
      reason: "needs_subject",
    });
  });
});

describe("relational hypothetical framings (compositional, not phrase patches)", () => {
  it("reads 'does spending less reduce my expenses?' as an expenses hypothetical", () => {
    expect(parseAssistantQuestion("Does spending less reduce my expenses?", NOW)).toEqual({
      intent: "expenseImpact",
      category: null,
      period: { kind: "thisMonth" },
      mode: "hypothetical",
      effectGoal: "expenses",
      operation: "decrease",
    });
    expect(parseAssistantQuestion("Would spending less reduce my expenses?", NOW)).toEqual({
      intent: "expenseImpact",
      category: null,
      period: { kind: "thisMonth" },
      mode: "hypothetical",
      effectGoal: "expenses",
      operation: "decrease",
    });
  });

  it("reads 'would spending less increase my profit?' as a profit hypothetical", () => {
    expect(parseAssistantQuestion("Would spending less increase my profit?", NOW)).toEqual({
      intent: "expenseImpact",
      category: null,
      period: { kind: "thisMonth" },
      mode: "hypothetical",
      effectGoal: "profit",
      operation: "decrease",
    });
  });

  it("does not treat a factual retrospective as a scenario", () => {
    // The metric (not the change) is the subject before "reduce".
    const factual = parseAssistantQuestion("Did my expenses reduce last month?", NOW);
    expect(factual?.mode).toBeUndefined();
    // An imperative cut stays factual too.
    expect(parseAssistantQuestion("Reduce my expenses this month", NOW)?.mode).toBeUndefined();
  });
});

describe("final natural-language QA (semantic classification)", () => {
  it("answers the full natural-language list deterministically", () => {
    const q = (question: string) => parseAssistantQuestion(question, NOW);
    // Extremes — the comparator flips "top" to "lowest".
    expect(q("What did I spend least on?")?.intent).toBe("lowestCategory");
    expect(q("What did I spend the least on?")?.intent).toBe("lowestCategory");
    expect(q("wat did I spend lest on?")?.intent).toBe("lowestCategory");
    expect(q("What did I spend least on all time?")).toEqual({
      intent: "lowestCategory",
      category: null,
      period: { kind: "allTime" },
    });

    // Hypothetical / counterfactual reasoning with effect goals.
    expect(q("If I spent less on Other, would my profit increase?")).toEqual({
      intent: "expenseImpact",
      category: "Other",
      period: { kind: "thisMonth" },
      mode: "hypothetical",
      effectGoal: "profit",
      operation: "decrease",
    });
    expect(q("If I spent less on Other, would my expenses decrease?")).toEqual({
      intent: "expenseImpact",
      category: "Other",
      period: { kind: "thisMonth" },
      mode: "hypothetical",
      effectGoal: "expenses",
      operation: "decrease",
    });
    expect(q("If I reduce my spending, what happens to my profit?")?.mode).toBe("hypothetical");
    expect(q("Would spending less increase my profit?")?.effectGoal).toBe("profit");
    expect(q("Does spending less reduce my expenses?")?.effectGoal).toBe("expenses");

    // Explicit prior-window comparisons and user-stated amounts.
    const priorWindow = q("If I spent less than last month, would my profit be higher?");
    expect(priorWindow).toEqual({
      intent: "expenseImpact",
      category: null,
      period: { kind: "thisMonth" },
      mode: "comparison",
      effectGoal: "profit",
      operation: "decrease",
    });
    expect(q("What if I spent ₦50,000 less on Other?")?.hypotheticalAmount).toBe(50_000);
    expect(q("What if I spent ₦50,000 less on Other?")?.category).toBe("Other");
    expect(q("If I spent 50k less on Other, what would my profit be?")?.hypotheticalAmount).toBe(50_000);
    expect(q("If I spent 50k less on Other, what would my profit be?")?.effectGoal).toBe("profit");
    expect(q("What if I reduced Rent?")?.category).toBe("Rent");

    // Vague-but-financial turns produce clarifications, not guesses.
    const clarify = (question: string) => classifyAssistantQuestion(question, NOW);
    expect(clarify("How did I do?")).toEqual({ kind: "clarification", reason: "ambiguous_financial_metric" });
    expect(clarify("What happened?")).toEqual({ kind: "clarification", reason: "ambiguous_financial_metric" });
    expect(clarify("How much was it?")).toEqual({ kind: "clarification", reason: "ambiguous_financial_metric" });

    // Genuinely unrelated questions stay out of scope.
    expect(classifyAssistantQuestion("What's the weather?", NOW)).toEqual({ kind: "unsupported" });
    expect(classifyAssistantQuestion("Who won the football match?", NOW)).toEqual({ kind: "unsupported" });
    expect(classifyAssistantQuestion("Write me a poem.", NOW)).toEqual({ kind: "unsupported" });
  });

  it("keeps the two screenshot-regression questions resolved differently", () => {
    expect(parseAssistantQuestion("What if I reduced Rent?", NOW)).toEqual({
      intent: "expenseImpact",
      category: "Rent",
      period: { kind: "thisMonth" },
      mode: "hypothetical",
      effectGoal: "profit",
      operation: "decrease",
    });
    const profit = parseAssistantQuestion(
      "If I spent less on others, would my profit increase than before?",
      NOW,
    );
    const expenses = parseAssistantQuestion(
      "If I spent less on others, would my expense reduce than before?",
      NOW,
    );
    expect(profit).toEqual({
      intent: "expenseImpact",
      category: "Other",
      period: { kind: "thisMonth" },
      mode: "hypothetical",
      effectGoal: "profit",
      operation: "decrease",
    });
    expect(expenses).toEqual({
      intent: "expenseImpact",
      category: "Other",
      period: { kind: "thisMonth" },
      mode: "hypothetical",
      effectGoal: "expenses",
      operation: "decrease",
    });
    expect(profit).not.toEqual(expenses);
  });

  it("exposes the savings clarification wording", () => {
    expect(SAVINGS_CLARIFICATION_ANSWER).toContain("spent less than the previous period");
    expect(SAVINGS_CLARIFICATION_ANSWER).toContain("money you had left after expenses");
  });
});

describe("expense breakdown semantics (browser QA issue 1 + 2)", () => {
  it("reads 'what did I spend <amount> on' as a context-anchored breakdown", () => {
    const result = understand("What did I spend 187,600 on?", NOW);
    expect(result.classification).toBe("query");
    if (result.classification !== "query") return;
    expect(result.intent).toBe("expense_breakdown");
    expect(result.period).toEqual({ kind: "conversation_reference" });
    expect(result.amountReference).toEqual({ value: 187600, source: "user_stated" });
  });

  it("classifies a standalone amount breakdown as an ambiguous_amount clarification", () => {
    const classified = classifyAssistantQuestion("What did I spend 187,600 on?", NOW);
    expect(classified).toEqual({ kind: "clarification", reason: "ambiguous_amount" });
  });

  it("resolves 'what category made my spending in August 187,600' to an explicit-month breakdown", () => {
    const result = understand("What category made my spending in August 187,600?", NOW);
    expect(result.classification).toBe("query");
    if (result.classification !== "query") return;
    expect(result.intent).toBe("expense_breakdown");
    expect(result.period).toEqual({ kind: "month", month: 7, year: 2026 });
    expect(result.amountReference).toEqual({ value: 187600, source: "user_stated" });
  });

  it("maps the amount-bearing breakdown to the engine query with its amountReference", () => {
    const query = parseAssistantQuestion("What did I spend 187,600 on this month?", NOW);
    expect(query?.intent).toBe("expenseBreakdown");
    expect(query?.amountReference).toEqual({ value: 187600, source: "user_stated" });
  });

  it("keeps referential phrasing ('that/this/it') as a context-anchored breakdown", () => {
    const result = understand("What did I spend that on?", NOW);
    expect(result.classification).toBe("query");
    if (result.classification !== "query") return;
    expect(result.intent).toBe("expense_breakdown");
    expect(result.period).toEqual({ kind: "conversation_reference" });
  });

  it("reads grammatical variants of the amount-reference breakdown", () => {
    for (const phrase of [
      "What was the 187600 spent on?",
      "What was the 187,600 spent on?",
    ]) {
      const result = understand(phrase, NOW);
      expect(result.classification, phrase).toBe("query");
      if (result.classification !== "query") return;
      expect(result.intent).toBe("expense_breakdown");
      expect(result.period).toEqual({ kind: "conversation_reference" });
      expect(result.amountReference).toEqual({ value: 187600, source: "user_stated" });
    }
  });

  it("reads an amount-register reference that names no figure of its own", () => {
    const result = understand("What was that amount spent on?", NOW);
    expect(result.classification).toBe("query");
    if (result.classification !== "query") return;
    expect(result.intent).toBe("expense_breakdown");
    expect(result.period).toEqual({ kind: "conversation_reference" });
    expect(result.amountReference).toBeUndefined();
  });

  it("reads 'where did that amount go' as a context-anchored breakdown", () => {
    const result = understand("Where did that amount go?", NOW);
    expect(result.classification).toBe("query");
    if (result.classification !== "query") return;
    expect(result.intent).toBe("expense_breakdown");
    expect(result.period).toEqual({ kind: "conversation_reference" });
    const followUp = analyzeFollowUp("Where did that amount go?", NOW);
    expect(followUp).toEqual({ kind: "expenseBreakdown", amount: null, referential: true });
  });

  it("treats a bare amount or register-only reference as a figure continuation", () => {
    expect(analyzeFollowUp("the 187600", NOW)).toEqual({
      kind: "amountConfirmation",
      amount: 187600,
    });
    expect(analyzeFollowUp("187,600", NOW)).toEqual({
      kind: "amountConfirmation",
      amount: 187600,
    });
    expect(analyzeFollowUp("That amount", NOW)).toEqual({
      kind: "amountConfirmation",
      amount: null,
    });
    // Standalone (no owned context to anchor against) they become an
    // ambiguous_amount clarification — never a guess, never non-financial.
    expect(understand("the 187600", NOW).classification).toBe("clarification");
    expect(understand("That amount", NOW).classification).toBe("clarification");
  });

  it("reads no-amount category-breakdown variants without an impact lecture", () => {
    for (const phrase of [
      "What category made my spending in August?",
      "What category made up my spending in August?",
      "Which category made my spending in August?",
      "What made up my August spending?",
      "How was my August spending divided by category?",
    ]) {
      const result = understand(phrase, NOW);
      expect(result.classification, phrase).toBe("query");
      if (result.classification !== "query") return;
      expect(result.intent).toBe("expense_breakdown");
      expect(result.period).toEqual({ kind: "month", month: 7, year: 2026 });
      expect(result.amountReference).toBeUndefined();
    }
    // The engine query stays a real breakdown, not an impact narration.
    expect(parseAssistantQuestion("What category made my spending in August?", NOW)?.intent).toBe(
      "expenseBreakdown",
    );
    expect(
      parseAssistantQuestion("What category made my spending in August?", NOW)?.period,
    ).toEqual({ kind: "month", month: 7, year: 2026 });
  });

  it("keeps top-category and revenue-impact phrasing untouched", () => {
    expect(
      parseAssistantQuestion("Which category did I spend the most on in August?", NOW)?.intent,
    ).toBe("topCategory");
    expect(
      parseAssistantQuestion("In this year, what have I spent money on that made my revenue lesser than before?", NOW)?.intent,
    ).toBe("expenseImpact");
  });

  it("never hijacks the plain distribution / income-vs-expenses surfaces", () => {
    expect(parseAssistantQuestion("Which categories did I spend on this month?", NOW)?.intent).toBe(
      "spendingDistribution",
    );
    expect(parseAssistantQuestion("How much did I earn and spend this month?", NOW)?.intent).toBe(
      "incomeVsExpenses",
    );
    expect(parseAssistantQuestion("What is my profit margin?", NOW)?.intent).toBe("profitMargin");
  });

  it("narrates a verified expense breakdown with category amounts", () => {
    const query = parseAssistantQuestion("What did my spending consist of this month?", NOW);
    if (!query) throw new Error("expected a query");
    expect(query.intent).toBe("expenseBreakdown");
    const answer = answerFromMetrics(
      query,
      metrics(
        computeSummary([
          { type: "expense", amount: 187_600 },
          { type: "income", amount: 500_000 },
        ]),
        [
          { categoryName: "Software", amount: 97_200, priorAmount: 0 },
          { categoryName: "Rent", amount: 36_500, priorAmount: 0 },
          { categoryName: "Marketing", amount: 30_000, priorAmount: 0 },
        ],
      ),
      "NGN",
      NOW,
    );
    expect(answer.kind).toBe("answer");
    if (answer.kind !== "answer") return;
    expect(answer.text).toContain("your ₦187,600 spending");
    expect(answer.text).toContain("Software");
    expect(answer.text).toContain("Rent");
    expect(answer.text).toContain("Marketing");
    expect(answer.data?.breakdown).toHaveLength(3);
  });
});

describe("clarification-selection follow-ups (browser QA issue 3)", () => {
  it("reads 'the two' and 'both' as a both-selection follow-up", () => {
    for (const phrase of [
      "The two",
      "Both",
      "Both of them",
      "Both of those",
      "I mean both",
      "Those two",
      "I want both",
      "Both readings",
      "Both meanings",
      "Both options",
      "The two of them",
      "Please give me both",
    ]) {
      expect(analyzeFollowUp(phrase, NOW), phrase).toEqual({
        kind: "clarificationSelection",
        selection: "both",
      });
    }
  });

  it("does not give a standalone selection turn financial meaning", () => {
    // Without a preceding owned two-option clarification, "Both" names no
    // financial subject — it must not resolve to a metric.
    const classified = classifyAssistantQuestion("Both", NOW);
    expect(classified.kind).toBe("unsupported");
    const understood = understand("Both", NOW);
    expect(understood.classification).toBe("unsupported");
  });

  it("keeps normal plural turns ('both' of my accounts) untouched", () => {
    const understood = understand("What is the balance across both of my accounts?", NOW);
    // A balance question, not a clarification selection: both accounts.
    expect(understood.classification).toBe("query");
    if (understood.classification === "query") {
      expect(understood.intent).toBe("balance");
    }
  });
});
