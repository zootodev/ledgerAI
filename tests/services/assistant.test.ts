import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/services/auth-context", () => ({
  requireAuthContext: vi.fn(),
  AuthorizationError: class AuthorizationError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "AuthorizationError";
    }
  },
}));

vi.mock("@/lib/ai/provider", () => ({
  getAIService: vi.fn(),
}));

import { requireAuthContext, AuthorizationError } from "@/lib/services/auth-context";
import { getAssistantAnswer } from "@/lib/services/assistant";
import { getAIService } from "@/lib/ai/provider";

const userA = { id: "auth-user-a", email: "a@example.com", name: "User A" };
const businessA = { id: "biz-a", name: "A Ltd", currency: "NGN" };
const NOW = new Date("2026-08-15T12:00:00.000Z");

function makeDecimal(value: number) {
  return { toString: () => value.toFixed(2) };
}

function makeTypeGroup(type: string, amount: number, count = 1) {
  return { type, _sum: { amount: makeDecimal(amount) }, _count: count };
}

function makeCategoryGroup(categoryId: string | null, amount: number) {
  return { categoryId, _sum: { amount: makeDecimal(amount) } };
}

const mockedRequireAuthContext = vi.mocked(requireAuthContext);
const mockedGetAIService = vi.mocked(getAIService);

// Stable assistant instance reused on every getAIService() mock return so
// tests can assert the narration seam by overriding its answer().
const mockAssistant = { answer: vi.fn().mockResolvedValue("") };
const mockAIService = {
  categorizer: {} as never,
  insightGenerator: undefined,
  assistant: mockAssistant,
};

const mockPrisma = {
  business: { findFirst: vi.fn() },
  transaction: { groupBy: vi.fn() },
  category: { findMany: vi.fn() },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.business.findFirst.mockReset();
  mockPrisma.transaction.groupBy.mockReset();
  mockPrisma.category.findMany.mockReset();
  mockAssistant.answer.mockReset();
  mockAssistant.answer.mockResolvedValue("");
  mockedRequireAuthContext.mockReset();
  mockedRequireAuthContext.mockResolvedValue({
    user: userA,
    business: businessA,
    prisma: mockPrisma as never,
  });
  mockedGetAIService.mockReset();
  mockedGetAIService.mockReturnValue(mockAIService);
});

/**
 * Seed data for a this-month income query. The balance aggregation is gated
 * on the balance intent, so only the current + prior type groupBy queries run.
 */
function seedIncome() {
  mockPrisma.transaction.groupBy
    .mockResolvedValueOnce([makeTypeGroup("income", 1_000_000), makeTypeGroup("expense", 600_000)]) // current Aug
    .mockResolvedValueOnce([makeTypeGroup("income", 800_000), makeTypeGroup("expense", 700_000)]); // prior Jul
}

describe("getAssistantAnswer (service pipeline)", () => {
  it("returns an answer DTO for an income question", async () => {
    seedIncome();
    const answer = await getAssistantAnswer("How much income did I earn?", NOW);
    expect(answer.kind).toBe("answer");
    expect(answer.text).toContain("August 2026");
    expect(answer.text).toContain("1,000,000");
  });

  it("scopes every aggregation to the session-derived business id", async () => {
    seedIncome();
    await getAssistantAnswer("How much income did I earn?", NOW);

    const calls = mockPrisma.transaction.groupBy.mock.calls;
    expect(calls).toHaveLength(2);
    for (const [args] of calls) {
      expect(args.where.businessId).toBe(businessA.id);
    }
  });

  it("uses inclusive current and prior month bounds", async () => {
    seedIncome();
    await getAssistantAnswer("How much income did I earn?", NOW);

    const calls = mockPrisma.transaction.groupBy.mock.calls;
    expect(calls[0][0].where.date.gte).toEqual(new Date("2026-08-01T00:00:00.000Z"));
    expect(calls[0][0].where.date.lte).toEqual(new Date("2026-08-31T23:59:59.999Z"));
    expect(calls[1][0].where.date.lte).toEqual(new Date("2026-07-31T23:59:59.999Z"));
  });

  it("does not run the as-of balance aggregation for non-balance questions", async () => {
    seedIncome();
    await getAssistantAnswer("How much income did I earn?", NOW);

    const calls = mockPrisma.transaction.groupBy.mock.calls;
    expect(calls).toHaveLength(2); // current + prior only — no balance groupBy
    for (const [args] of calls) {
      expect(args.where.businessId).toBe(businessA.id);
      expect(args.where.date).toBeDefined();
    }
  });

  it("runs the as-of balance aggregation for balance questions", async () => {
    mockPrisma.transaction.groupBy
      .mockResolvedValueOnce([makeTypeGroup("income", 1_000_000), makeTypeGroup("expense", 600_000)]) // balance (as of Aug, no lower bound)
      .mockResolvedValueOnce([]) // current types
      .mockResolvedValueOnce([]); // prior types

    const answer = await getAssistantAnswer("What is my cash balance?", NOW);
    expect(answer.kind).toBe("answer");
    expect(answer.text).toContain("400,000");

    const calls = mockPrisma.transaction.groupBy.mock.calls;
    expect(calls).toHaveLength(3); // balance + current + prior
    expect(calls[0][0].where.businessId).toBe(businessA.id);
    expect(calls[0][0].where.date.gte).toBeUndefined(); // as-of: open lower bound
    expect(calls[0][0].where.date.lte).toEqual(new Date("2026-08-31T23:59:59.999Z"));
  });

  it("returns an unsupported DTO when the question maps to no intent", async () => {
    const answer = await getAssistantAnswer("What is the meaning of life?", NOW);
    expect(answer.kind).toBe("unsupported");
    expect(answer.text.length).toBeGreaterThan(0);
  });

  it("returns insufficient when the window has no data", async () => {
    mockPrisma.transaction.groupBy
      .mockResolvedValueOnce([]) // current
      .mockResolvedValueOnce([]); // prior
    const answer = await getAssistantAnswer("How much did I spend?", NOW);
    expect(answer.kind).toBe("insufficient");
  });

  it("rethrows unexpected service failures for the caller to handle", async () => {
    mockedRequireAuthContext.mockRejectedValue(new Error("db exploded"));
    await expect(getAssistantAnswer("How much did I spend?", NOW)).rejects.toThrow(
      "db exploded",
    );
  });

  it("narrates a category spend with the matched total", async () => {
    mockPrisma.transaction.groupBy
      .mockResolvedValueOnce([makeTypeGroup("income", 1_000_000), makeTypeGroup("expense", 600_000)]) // current types
      .mockResolvedValueOnce([makeTypeGroup("income", 800_000), makeTypeGroup("expense", 700_000)]) // prior types
      .mockResolvedValueOnce([makeCategoryGroup("cat-rent", 280_000)]) // current categories
      .mockResolvedValueOnce([makeCategoryGroup("cat-rent", 260_000)]); // prior categories
    mockPrisma.category.findMany.mockResolvedValueOnce([
      { id: "cat-rent", name: "Rent" },
    ]);

    const answer = await getAssistantAnswer("How much did I spend on rent?", NOW);
    expect(answer.kind).toBe("answer");
    expect(answer.text).toContain("280,000");
  });

  it("rethrows authorization errors for the caller to redirect", async () => {
    mockedRequireAuthContext.mockRejectedValue(
      new (await import("@/lib/services/auth-context")).AuthorizationError(
        "You must be signed in.",
      ),
    );
    await expect(getAssistantAnswer("How much did I spend?", NOW)).rejects.toBeInstanceOf(
      AuthorizationError,
    );
  });

  it("routes the answer through the AI narration seam", async () => {
    seedIncome();
    mockAssistant.answer = vi.fn().mockResolvedValue("Narrated draft");
    const answer = await getAssistantAnswer("How much income did I earn?", NOW);
    expect(mockAssistant.answer).toHaveBeenCalled();
    expect(answer.text).toBe("Narrated draft");
  });
});

describe("transfer semantics (financially neutral rows)", () => {
  // One month with income (2 rows), expenses (3 rows) and a transfer (1 row).
  const typeGroups = [
    makeTypeGroup("income", 1_000_000, 2),
    makeTypeGroup("expense", 600_000, 3),
    makeTypeGroup("transfer", 200_000, 1),
  ];
  const noPrior: never[] = [];
  const categorySingle = [makeCategoryGroup("cat-inventory", 300_000)];

  it("excludes transfers from income", async () => {
    mockPrisma.transaction.groupBy
      .mockResolvedValueOnce(typeGroups)
      .mockResolvedValueOnce(noPrior);
    const answer = await getAssistantAnswer("How much income did I earn?", NOW);
    expect(answer.kind).toBe("answer");
    expect(answer.text).toContain("1,000,000");
    expect(answer.text).not.toContain("200,000");
  });

  it("excludes transfers from expenses", async () => {
    mockPrisma.transaction.groupBy
      .mockResolvedValueOnce(typeGroups)
      .mockResolvedValueOnce(noPrior);
    const answer = await getAssistantAnswer("What were my expenses?", NOW);
    expect(answer.kind).toBe("answer");
    expect(answer.text).toContain("600,000");
    expect(answer.text).not.toContain("200,000");
  });

  it("excludes transfers from profit", async () => {
    mockPrisma.transaction.groupBy
      .mockResolvedValueOnce(typeGroups)
      .mockResolvedValueOnce(noPrior);
    const answer = await getAssistantAnswer("Did I make a profit?", NOW);
    expect(answer.kind).toBe("answer");
    expect(answer.text).toContain("400,000");
    expect(answer.text).toContain("40%");
    expect(answer.text).not.toContain("200,000");
  });

  it("keeps transfers out of category-spend calculations", async () => {
    mockPrisma.transaction.groupBy
      .mockResolvedValueOnce(typeGroups) // current types
      .mockResolvedValueOnce(noPrior) // prior types
      .mockResolvedValueOnce(categorySingle) // current categories
      .mockResolvedValueOnce([]); // prior categories
    mockPrisma.category.findMany.mockResolvedValueOnce([
      { id: "cat-inventory", name: "Inventory" },
    ]);

    const answer = await getAssistantAnswer("What was my top expense category?", NOW);
    expect(answer.kind).toBe("answer");
    expect(answer.text).toContain("Inventory");
    expect(answer.text).toContain("300,000");

    const categoryCalls = mockPrisma.transaction.groupBy.mock.calls.filter(
      (c) => {
        const args = c[0] as { by?: string[] };
        return args.by?.[0] === "categoryId";
      },
    );
    expect(categoryCalls.length).toBe(2);
    for (const c of categoryCalls) {
      const args = c[0] as { where: { type: string; businessId: string } };
      expect(args.where.type).toBe("expense"); // transfers can never leak in
      expect(args.where.businessId).toBe(businessA.id);
    }
  });

  it("counts transfers in the transaction-count breakdown", async () => {
    mockPrisma.transaction.groupBy
      .mockResolvedValueOnce(typeGroups)
      .mockResolvedValueOnce(noPrior);
    const answer = await getAssistantAnswer("How many transactions were there?", NOW);
    expect(answer.kind).toBe("answer");
    expect(answer.text).toContain("6 transactions");
    expect(answer.text).toContain("2 income, 3 expenses, 1 transfer");
  });
});

describe("service period coverage (period → real DB bounds)", () => {
  it("resolves last month into the DB window and its prior window", async () => {
    mockPrisma.transaction.groupBy
      .mockResolvedValueOnce([makeTypeGroup("expense", 500_000, 5)]) // current July
      .mockResolvedValueOnce([makeTypeGroup("expense", 700_000, 7)]); // prior (June window)
    const answer = await getAssistantAnswer("How much did I spend last month?", NOW);
    expect(answer.kind).toBe("answer");
    expect(answer.text).toContain("July 2026");
    expect(answer.text).toContain("500,000");

    const calls = mockPrisma.transaction.groupBy.mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0][0].where.date.gte).toEqual(new Date("2026-07-01T00:00:00.000Z"));
    expect(calls[0][0].where.date.lte).toEqual(new Date("2026-07-31T23:59:59.999Z"));
    expect(calls[1][0].where.date.lte).toEqual(new Date("2026-06-30T23:59:59.999Z"));
  });

  it("resolves this year into the DB window (Jan 1 – Dec 31)", async () => {
    mockPrisma.transaction.groupBy
      .mockResolvedValueOnce([makeTypeGroup("income", 5_000_000, 10)]) // current 2026
      .mockResolvedValueOnce([makeTypeGroup("income", 4_000_000, 8)]); // prior (shifted 2025 window)
    const answer = await getAssistantAnswer("How much income did I earn this year?", NOW);
    expect(answer.kind).toBe("answer");
    expect(answer.text).toContain("2026");
    expect(answer.text).toContain("5,000,000");

    const calls = mockPrisma.transaction.groupBy.mock.calls;
    expect(calls[0][0].where.date.gte).toEqual(new Date("2026-01-01T00:00:00.000Z"));
    expect(calls[0][0].where.date.lte).toEqual(new Date("2026-12-31T23:59:59.999Z"));
  });

  it("resolves all time to an unbounded window with no prior fetch", async () => {
    mockPrisma.transaction.groupBy.mockResolvedValueOnce([
      makeTypeGroup("expense", 3_000_000, 20),
    ]);
    const answer = await getAssistantAnswer("How much did I spend overall?", NOW);
    expect(answer.kind).toBe("answer");
    expect(answer.text).toContain("all time");
    expect(answer.text).toContain("3,000,000");

    const calls = mockPrisma.transaction.groupBy.mock.calls;
    expect(calls).toHaveLength(1); // no balance, no prior for an unbounded window
    expect(calls[0][0].where.businessId).toBe(businessA.id);
    expect(calls[0][0].where.date).toBeUndefined();
  });

  it("resolves an explicit named month into its window", async () => {
    mockPrisma.transaction.groupBy
      .mockResolvedValueOnce([makeTypeGroup("expense", 150_000, 3)]) // June 2026
      .mockResolvedValueOnce([makeTypeGroup("expense", 120_000, 2)]); // prior (May window)
    const answer = await getAssistantAnswer("How much did I spend in June 2026?", NOW);
    expect(answer.kind).toBe("answer");
    expect(answer.text).toContain("June 2026");
    expect(answer.text).toContain("150,000");

    const calls = mockPrisma.transaction.groupBy.mock.calls;
    expect(calls[0][0].where.date.gte).toEqual(new Date("2026-06-01T00:00:00.000Z"));
    expect(calls[0][0].where.date.lte).toEqual(new Date("2026-06-30T23:59:59.999Z"));
    expect(calls[1][0].where.date.lte).toEqual(new Date("2026-05-31T23:59:59.999Z"));
  });
});