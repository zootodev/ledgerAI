import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/server", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({
  getPrismaClient: vi.fn(),
}));

vi.mock("@/generated/prisma/client", () => ({
  PrismaClient: class {},
}));

import { getCurrentUser } from "@/lib/auth/server";
import { getPrismaClient } from "@/lib/db/client";
import {
  listCategoryRules,
  deleteCategoryRule,
  learnMerchantRule,
  persistLearnedRules,
  isCategoryRuleMatchType,
} from "@/lib/services/rules";

const userA = { id: "auth-user-a", email: "a@example.com", name: "User A" };
const businessA = { id: "biz-a", name: "A Ltd", currency: "GBP" };

const UUID_CATEGORY_OWNED = "11111111-1111-4111-8111-111111111111";
const UUID_CATEGORY_FOREIGN = "99999999-9999-4999-8999-999999999999";
const UUID_RULE_OWNED = "22222222-2222-4222-8222-222222222222";
const UUID_RULE_FOREIGN = "88888888-8888-4888-8888-888888888888";

function makeRuleRow(overrides: Record<string, unknown> = {}) {
  return {
    id: UUID_RULE_OWNED,
    businessId: businessA.id,
    matchType: "merchant",
    pattern: "UBER",
    categoryId: UUID_CATEGORY_OWNED,
    categoryName: "Transportation",
    createdAt: new Date("2026-09-01T12:00:00.000Z"),
    ...overrides,
  };
}

const mockedGetPrismaClient = vi.mocked(getPrismaClient);
const mockedGetCurrentUser = vi.mocked(getCurrentUser);

const mockPrisma = {
  business: { findFirst: vi.fn() },
  categoryRule: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    upsert: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  category: {
    findFirst: vi.fn(),
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockedGetPrismaClient.mockReturnValue(mockPrisma as never);
  mockedGetCurrentUser.mockResolvedValue(userA as never);
  mockPrisma.business.findFirst.mockResolvedValue(businessA as never);
});

describe("listCategoryRules", () => {
  it("lists only the current business's rules, newset first, as DTOs", async () => {
    mockPrisma.categoryRule.findMany.mockResolvedValue([
      makeRuleRow({ createdAt: new Date("2026-09-02T00:00:00.000Z") }),
      makeRuleRow({ id: "other", matchType: "keyword", pattern: "WINE", createdAt: new Date("2026-09-01T00:00:00.000Z") }),
    ]);

    const rules = await listCategoryRules();

    expect(mockPrisma.categoryRule.findMany).toHaveBeenCalledWith({
      where: { businessId: businessA.id },
      orderBy: { createdAt: "desc" },
    });
    expect(rules).toEqual([
      {
        id: UUID_RULE_OWNED,
        businessId: businessA.id,
        matchType: "merchant",
        pattern: "UBER",
        categoryId: UUID_CATEGORY_OWNED,
        categoryName: "Transportation",
        createdAt: "2026-09-02T00:00:00.000Z",
      },
      {
        id: "other",
        businessId: businessA.id,
        matchType: "keyword",
        pattern: "WINE",
        categoryId: UUID_CATEGORY_OWNED,
        categoryName: "Transportation",
        createdAt: "2026-09-01T00:00:00.000Z",
      },
    ]);
  });

  it("coerces a null categoryName to an empty string in the DTO", async () => {
    mockPrisma.categoryRule.findMany.mockResolvedValue([
      makeRuleRow({ categoryName: null }),
    ]);
    const rules = await listCategoryRules();
    expect(rules[0].categoryName).toBe("");
  });
});

describe("deleteCategoryRule", () => {
  it("deletes an owned rule", async () => {
    mockPrisma.categoryRule.findFirst.mockResolvedValue({ id: UUID_RULE_OWNED });

    const result = await deleteCategoryRule(UUID_RULE_OWNED);

    expect(result).toBe(true);
    expect(mockPrisma.categoryRule.findFirst).toHaveBeenCalledWith({
      where: { id: UUID_RULE_OWNED, businessId: businessA.id },
      select: { id: true },
    });
    expect(mockPrisma.categoryRule.delete).toHaveBeenCalledWith({ where: { id: UUID_RULE_OWNED } });
  });

  it("returns false without deleting for a foreign or unknown id", async () => {
    mockPrisma.categoryRule.findFirst.mockResolvedValue(null);

    const result = await deleteCategoryRule(UUID_RULE_FOREIGN);

    expect(result).toBe(false);
    expect(mockPrisma.categoryRule.delete).not.toHaveBeenCalled();
  });

  it("returns false for a malformed id", async () => {
    const result = await deleteCategoryRule("not-a-uuid");
    expect(result).toBe(false);
  });
});

describe("persistLearnedRules / learnMerchantRule", () => {
  it("upserts a merchant rule scoped to the current business", async () => {
    mockPrisma.category.findFirst.mockResolvedValue({ id: UUID_CATEGORY_OWNED });
    mockPrisma.categoryRule.upsert.mockResolvedValue(makeRuleRow());

    const count = await learnMerchantRule({
      pattern: "UBER",
      categoryId: UUID_CATEGORY_OWNED,
      categoryName: "Transportation",
    });

    expect(count).toBe(1);
    expect(mockPrisma.category.findFirst).toHaveBeenCalledWith({
      where: {
        id: UUID_CATEGORY_OWNED,
        OR: [{ businessId: null }, { businessId: businessA.id }],
      },
      select: { id: true },
    });
    expect(mockPrisma.categoryRule.upsert).toHaveBeenCalledWith({
      where: {
        businessId_matchType_pattern: {
          businessId: businessA.id,
          matchType: "merchant",
          pattern: "UBER",
        },
      },
      update: { categoryId: UUID_CATEGORY_OWNED, categoryName: "Transportation" },
      create: {
        businessId: businessA.id,
        matchType: "merchant",
        pattern: "UBER",
        categoryId: UUID_CATEGORY_OWNED,
        categoryName: "Transportation",
      },
    });
  });

  it("accepts a system category as a valid rule target", async () => {
    mockPrisma.category.findFirst.mockResolvedValue({ id: UUID_CATEGORY_OWNED });
    mockPrisma.categoryRule.upsert.mockResolvedValue(makeRuleRow());

    const count = await persistLearnedRules(
      [{ matchType: "keyword", pattern: "WINE", categoryId: UUID_CATEGORY_OWNED, categoryName: "Marketing" }],
      "import",
    );

    expect(count).toBe(1);
    expect(mockPrisma.categoryRule.upsert).toHaveBeenCalledTimes(1);
  });

  it("skips rules whose target category is not owned by the business or system", async () => {
    mockPrisma.category.findFirst.mockResolvedValue(null);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const count = await learnMerchantRule({
      pattern: "UBER",
      categoryId: UUID_CATEGORY_FOREIGN,
      categoryName: "Transportation",
    });

    expect(count).toBe(0);
    expect(mockPrisma.categoryRule.upsert).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("skips invalid candidates without disturbing the rest of the batch", async () => {
    mockPrisma.category.findFirst.mockResolvedValue({ id: UUID_CATEGORY_OWNED });
    mockPrisma.categoryRule.upsert.mockResolvedValue(makeRuleRow());
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const count = await persistLearnedRules(
      [
        { matchType: "merchant", pattern: "  ", categoryId: UUID_CATEGORY_OWNED, categoryName: "Transportation" },
        { matchType: "merchant", pattern: "UBER", categoryId: UUID_CATEGORY_OWNED, categoryName: "Transportation" },
      ],
      "import",
    );

    expect(count).toBe(1);
    expect(mockPrisma.categoryRule.upsert).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("continues when a single upsert fails and never throws", async () => {
    mockPrisma.category.findFirst.mockResolvedValue({ id: UUID_CATEGORY_OWNED });
    mockPrisma.categoryRule.upsert
      .mockRejectedValueOnce(new Error("db down"))
      .mockResolvedValueOnce(makeRuleRow({ id: "second" }));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const count = await persistLearnedRules(
      [
        { matchType: "merchant", pattern: "UBER", categoryId: UUID_CATEGORY_OWNED, categoryName: "Transportation" },
        { matchType: "merchant", pattern: "GTFOOD", categoryId: UUID_CATEGORY_OWNED, categoryName: "Food" },
      ],
      "import",
    );

    expect(count).toBe(1);
    expect(mockPrisma.categoryRule.upsert).toHaveBeenCalledTimes(2);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("failed to persist rule"),
      expect.objectContaining({ pattern: "UBER" }),
    );
    errorSpy.mockRestore();
  });

  it("returns 0 for an empty candidate list without touching the db", async () => {
    const count = await persistLearnedRules([], "import");
    expect(count).toBe(0);
    expect(mockPrisma.categoryRule.upsert).not.toHaveBeenCalled();
  });

  it("rejects uppercase/lowercase issues at the guard, never at learn time", () => {
    expect(isCategoryRuleMatchType("merchant")).toBe(true);
    expect(isCategoryRuleMatchType("keyword")).toBe(true);
    expect(isCategoryRuleMatchType("shipping")).toBe(false);
    expect(isCategoryRuleMatchType(undefined)).toBe(false);
  });
});