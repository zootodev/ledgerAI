import { describe, expect, it } from "vitest";
import {
  askV2ProposalSchema,
  askV2RequestSchema,
  askV2ResponseSchema,
} from "@/lib/ask-v2/contracts";

const UUID = "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d";

describe("askV2ProposalSchema — semantic arguments only", () => {
  it("accepts a valid proposal for every tool", () => {
    const valid = [
      { tool: "expense_summary", period: { kind: "thisMonth" } },
      { tool: "expense_breakdown", period: { kind: "lastMonth" } },
      { tool: "expense_breakdown", period: { kind: "thisYear" }, category: "Rent" },
      { tool: "expense_breakdown", period: { kind: "thisYear" }, category: "Rent", categoryOrigin: "explicit" },
      { tool: "expense_breakdown", period: { kind: "thisYear" }, category: "Inventory", categoryOrigin: "referenced" },
      { tool: "expense_breakdown", period: { kind: "thisYear" }, categoryOrigin: "referenced" },
      { tool: "expense_breakdown", period: { kind: "thisYear" }, scope: "complement" },
      { tool: "expense_breakdown", period: { kind: "lastMonth" }, scope: "aggregate" },
      { tool: "expense_breakdown", period: { kind: "thisYear" }, scope: "complement", category: "Rent" },
      { tool: "expense_breakdown", period: { kind: "thisYear" }, scope: "complement", category: "Rent", categoryOrigin: "explicit" },
      { tool: "expense_breakdown", period: { kind: "thisYear" }, scope: "complement", category: "Inventory", categoryOrigin: "referenced" },
      {
        tool: "expense_comparison",
        currentPeriod: { kind: "lastMonth" },
        priorPeriod: { kind: "month", month: 6, year: 2026 },
      },
      { tool: "category_ranking", period: { kind: "thisYear" } },
      { tool: "category_ranking", period: { kind: "lastMonth" } },
      { tool: "balance" },
      { tool: "transactions" },
      { tool: "transactions", period: { kind: "recent", days: 7 }, category: "Food" },
      { tool: "search_transactions", query: "bolanle kwame" },
      {
        tool: "search_transactions",
        query: "invoice #12",
        period: { kind: "thisYear" },
      },
      { tool: "goal_impact", category: "Food", delta: -50000, period: { kind: "thisMonth" } },
      { tool: "goal_impact", category: "Rent", delta: 120000, period: { kind: "allTime" } },
      { tool: "category_share", period: { kind: "thisYear" }, category: "Rent" },
      { tool: "category_share", period: { kind: "thisYear" }, category: "Inventory", categoryOrigin: "explicit" },
      { tool: "category_share", period: { kind: "lastMonth" }, category: "Rent", categoryOrigin: "referenced" },
      { tool: "category_share", period: { kind: "month", month: 6, year: 2026 }, category: "Salaries", categoryOrigin: "explicit" },
    ];
    for (const proposal of valid) {
      const result = askV2ProposalSchema.safeParse(proposal);
      expect(result.success, JSON.stringify(proposal)).toBe(true);
    }
  });

  it("rejects tenant context in every branch (businessId/userId/tenantId)", () => {
    const poisoned = [
      { tool: "expense_summary", period: { kind: "thisMonth" }, businessId: "biz-1" },
      { tool: "expense_breakdown", period: { kind: "lastMonth" }, userId: "usr-1" },
      { tool: "expense_comparison", currentPeriod: { kind: "lastMonth" }, priorPeriod: { kind: "thisYear" }, tenantId: "ten-1" },
      { tool: "balance", accountId: "acct-1" },
      { tool: "balance", businessId: "biz-1" },
      { tool: "transactions", category: "Food", tenantId: "ten-1" },
      { tool: "transactions", userId: "usr-1" },
      { tool: "search_transactions", query: "rent", businessId: "biz-1" },
      { tool: "goal_impact", category: "Food", delta: -50000, period: { kind: "thisMonth" }, userId: "usr-1" },
      { tool: "category_share", period: { kind: "thisYear" }, category: "Rent", businessId: "biz-1" },
      { tool: "category_share", period: { kind: "thisYear" }, category: "Rent", tenantId: "ten-1" },
    ];
    for (const proposal of poisoned) {
      const result = askV2ProposalSchema.safeParse(proposal);
      expect(result.success, JSON.stringify(proposal)).toBe(false);
    }
  });

  it("rejects unknown tools", () => {
    const result = askV2ProposalSchema.safeParse({ tool: "reset_everything" });
    expect(result.success).toBe(false);
  });

  it("rejects malformed semantic arguments", () => {
    const malformed = [
      { tool: "expense_summary" },
      { tool: "expense_summary", period: { kind: "fortnight" } },
      { tool: "goal_impact", category: "Food", period: { kind: "thisMonth" } },
      { tool: "goal_impact", category: "Food", delta: -99999999999999999, period: { kind: "thisMonth" } },
      { tool: "search_transactions", query: "" },
      { tool: "transactions", category: "" },
      { tool: "category_share", period: { kind: "thisYear" } },
      { tool: "category_share", period: { kind: "thisYear" }, category: "" },
    ];
    for (const proposal of malformed) {
      const result = askV2ProposalSchema.safeParse(proposal);
      expect(result.success, JSON.stringify(proposal)).toBe(false);
    }
  });

  it("category_share carries NO derived figure, scope, or complement", () => {
    const badFigure = [
      { tool: "category_share", period: { kind: "thisYear" }, category: "Rent", amount: 120000 },
      { tool: "category_share", period: { kind: "thisYear" }, category: "Rent", percent: 29 },
      { tool: "category_share", period: { kind: "thisYear" }, category: "Rent", share: 29 },
      { tool: "category_share", period: { kind: "thisYear" }, category: "Rent", total: 413300 },
      { tool: "category_share", period: { kind: "thisYear" }, category: "Rent", scope: "complement" },
    ];
    for (const proposal of badFigure) {
      const result = askV2ProposalSchema.safeParse(proposal);
      expect(result.success, JSON.stringify(proposal)).toBe(false);
    }
  });

  it("category_share requires a category: never aggregate or complement", () => {
    expect(askV2ProposalSchema.safeParse({ tool: "category_share", period: { kind: "thisYear" }, categoryOrigin: "referenced" }).success).toBe(false);
    expect(askV2ProposalSchema.safeParse({ tool: "category_share", period: { kind: "thisYear" }, category: "Rent", categoryOrigin: "stale" }).success).toBe(false);
  });

  it("accepts categoryOrigin only on expense_breakdown with strict enum values", () => {
    const badOriginOutOfScope = [
      { tool: "transactions", category: "Food", categoryOrigin: "explicit" },
      { tool: "expense_summary", period: { kind: "thisMonth" }, categoryOrigin: "explicit" },
      { tool: "goal_impact", category: "Food", delta: -50000, period: { kind: "thisMonth" }, categoryOrigin: "explicit" },
    ];
    for (const proposal of badOriginOutOfScope) {
      const result = askV2ProposalSchema.safeParse(proposal);
      expect(result.success, JSON.stringify(proposal)).toBe(false);
    }

    const badOriginValue = { tool: "expense_breakdown", period: { kind: "thisYear" }, category: "Rent", categoryOrigin: "stale" };
    expect(askV2ProposalSchema.safeParse(badOriginValue).success).toBe(false);
  });

  it("accepts scope only on expense_breakdown with strict enum values", () => {
    const badScopeOutOfScope = [
      { tool: "expense_summary", period: { kind: "thisMonth" }, scope: "complement" },
      { tool: "category_ranking", period: { kind: "thisYear" }, scope: "complement" },
      { tool: "balance", scope: "aggregate" },
      { tool: "transactions", scope: "complement" },
    ];
    for (const proposal of badScopeOutOfScope) {
      const result = askV2ProposalSchema.safeParse(proposal);
      expect(result.success, JSON.stringify(proposal)).toBe(false);
    }

    const badScopeValue = { tool: "expense_breakdown", period: { kind: "thisYear" }, scope: "remainder" };
    expect(askV2ProposalSchema.safeParse(badScopeValue).success).toBe(false);
  });

  it("complement scope can never carry a financial value or figure", () => {
    const poisoned = [
      { tool: "expense_breakdown", period: { kind: "thisYear" }, scope: "complement", amount: 150000 },
      { tool: "expense_breakdown", period: { kind: "thisYear" }, scope: "complement", percent: 25 },
      { tool: "expense_breakdown", period: { kind: "thisYear" }, scope: "complement", total: 150000 },
      { tool: "expense_breakdown", period: { kind: "thisYear" }, scope: "complement", category: "Rent", share: 12.5 },
    ];
    for (const proposal of poisoned) {
      const result = askV2ProposalSchema.safeParse(proposal);
      expect(result.success, JSON.stringify(proposal)).toBe(false);
    }
  });

  it("category_ranking is period-only: rejects categories, limits, and tenant context", () => {
    const invalid = [
      { tool: "category_ranking" },
      { tool: "category_ranking", period: { kind: "thisYear" }, category: "Rent" },
      { tool: "category_ranking", period: { kind: "thisYear" }, categoryOrigin: "referenced" },
      { tool: "category_ranking", period: { kind: "thisYear" }, scope: "complement" },
      { tool: "category_ranking", period: { kind: "thisYear" }, limit: 3 },
      { tool: "category_ranking", period: { kind: "thisYear" }, top: 5 },
      { tool: "category_ranking", period: { kind: "thisYear" }, businessId: "biz-1" },
      { tool: "category_ranking", period: { kind: "thisYear" }, userId: "usr-1" },
      { tool: "category_ranking", period: { kind: "thisYear" }, tenantId: "ten-1" },
      { tool: "category_ranking", period: { kind: "fortnight" } },
    ];
    for (const proposal of invalid) {
      const result = askV2ProposalSchema.safeParse(proposal);
      expect(result.success, JSON.stringify(proposal)).toBe(false);
    }
  });
});

describe("askV2RequestSchema — API request boundary", () => {
  it("accepts a valid request with and without a conversation id", () => {
    const valid = [
      { proposal: { tool: "balance" } },
      { proposal: { tool: "expense_summary", period: { kind: "thisMonth" } }, conversationId: UUID },
      { proposal: { tool: "balance" }, conversationId: null },
    ];
    for (const request of valid) {
      const result = askV2RequestSchema.safeParse(request);
      expect(result.success, JSON.stringify(request)).toBe(true);
    }
  });

  it("rejects tenant context on the request envelope", () => {
    const result = askV2RequestSchema.safeParse({
      proposal: { tool: "balance" },
      businessId: "biz-1",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a malformed proposal or conversation id", () => {
    const bad = [
      { proposal: { tool: "balance", period: { kind: "allTime" } } },
      { proposal: "balance" },
      { proposal: { tool: "expense_summary", period: { kind: "thisMonth" } }, conversationId: "not-a-uuid" },
    ];
    for (const request of bad) {
      const result = askV2RequestSchema.safeParse(request);
      expect(result.success, JSON.stringify(request)).toBe(false);
    }
  });
});

describe("askV2ResponseSchema — API response boundary", () => {
  it("accepts every disposition", () => {
    const valid = [
      { disposition: "answer", text: "Spending was ₦187,600.", conversationId: UUID },
      {
        disposition: "clarification",
        reason: "ambiguous_financial_metric",
        text: "You mentioned an amount — what is it for?",
        conversationId: null,
      },
      {
        disposition: "unsupported",
        reason: "not_financial",
        text: "LedgerAI can only answer financial questions.",
        conversationId: null,
      },
      {
        disposition: "unsupported",
        reason: "not_supported",
        text: "A capability is not in this phase.",
        conversationId: null,
      },
    ];
    for (const response of valid) {
      const result = askV2ResponseSchema.safeParse(response);
      expect(result.success, JSON.stringify(response)).toBe(true);
    }
  });

  it("rejects missing text or unknown reasons", () => {
    const bad = [
      { disposition: "answer", text: "", conversationId: null },
      { disposition: "answer", conversationId: null },
      { disposition: "unsupported", reason: "nonsense", text: "x", conversationId: null },
      { disposition: "clarification", reason: "nonsense", text: "x", conversationId: null },
    ];
    for (const response of bad) {
      const result = askV2ResponseSchema.safeParse(response);
      expect(result.success, JSON.stringify(response)).toBe(false);
    }
  });
});