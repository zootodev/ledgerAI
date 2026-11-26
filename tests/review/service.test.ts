import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/services/auth-context", () => ({
  requireAuthContext: vi.fn(),
}));

const state = vi.hoisted(() => ({
  businessId: "biz-a",
  rows: [] as Array<Record<string, unknown>>,
  rules: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/services/rules", () => ({
  learnMerchantRule: vi.fn(async (input: { pattern: string; categoryId: string; categoryName: string }) => {
    const existing = state.rules.find(
      (rule) =>
        rule.businessId === state.businessId &&
        rule.matchType === "merchant" &&
        rule.pattern === input.pattern,
    );
    if (existing) {
      existing.categoryId = input.categoryId;
      existing.categoryName = input.categoryName;
      return 1;
    }
    state.rules.push({
      id: `rule-${state.rules.length + 1}`,
      businessId: state.businessId,
      matchType: "merchant",
      pattern: input.pattern,
      categoryId: input.categoryId,
      categoryName: input.categoryName,
      createdAt: new Date("2026-09-01"),
    });
    return 1;
  }),
}));

import { requireAuthContext } from "@/lib/services/auth-context";
import {
  applyReviewAction,
  listReviewGroups,
  undoReviewAction,
} from "@/lib/services/review";
import { signUndoToken } from "@/lib/review/undo-token";

const FOOD = "11111111-1111-4111-8111-111111111111";
const TRANSPORT = "22222222-2222-4222-8222-222222222222";

const decimal = (value: number) => ({ toString: () => value.toFixed(4) });

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: `tx-${Math.random().toString(36).slice(2)}`,
    businessId: "biz-a",
    description: "ZOOZ COFFEE 06SEP",
    amount: decimal(25),
    date: new Date("2026-09-06"),
    categoryId: FOOD,
    aiCategory: "Food",
    aiConfidence: decimal(0.4),
    type: "expense",
    ...overrides,
  };
}

const categories = [
  { id: FOOD, name: "Food", type: "expense", businessId: null },
  { id: TRANSPORT, name: "Transportation", type: "expense", businessId: null },
];

const prisma = {
  transaction: {
    findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
      state.rows
        .filter((row) => row.businessId === where.businessId)
        .filter(
          (row) =>
            row.categoryId !== null &&
            typeof row.aiConfidence === "object" &&
            row.aiConfidence !== null &&
            Number((row.aiConfidence as { toString(): string }).toString()) < 0.75,
        )
        .map((row) => ({ ...row })),
    ),
    updateMany: vi.fn(async ({ where, data }: { where: { id: string | { in: string[] }; businessId: string }; data: Record<string, unknown> }) => {
      const ids = typeof where.id === "string" ? [where.id] : where.id.in;
      let count = 0;
      for (const row of state.rows) {
        if (
          where.businessId === row.businessId &&
          ids.includes(row.id as string)
        ) {
          Object.assign(row, data);
          count += 1;
        }
      }
      return { count };
    }),
  },
  category: {
    findMany: vi.fn(async () => categories.map((category) => ({ ...category }))),
    findFirst: vi.fn(async ({ where }: { where: { id: string; OR: Array<{ businessId: string | null }> } }) => {
      const category = categories.find((c) => c.id === where.id);
      if (!category) return null;
      const allowed = where.OR.some(
        (scope) => scope.businessId === null || scope.businessId === category.businessId,
      );
      return allowed ? category : null;
    }),
  },
  categoryRule: {
    findMany: vi.fn(async ({ where }: { where: { businessId: string } }) =>
      state.rules.filter((rule) => rule.businessId === where.businessId).map((rule) => ({ ...rule })),
    ),
    findFirst: vi.fn(async ({ where }: { where: { businessId: string; matchType: string; pattern: string } }) =>
      state.rules.find(
        (rule) =>
          rule.businessId === where.businessId &&
          rule.matchType === where.matchType &&
          rule.pattern === where.pattern,
      ) ?? null,
    ),
    updateMany: vi.fn(async ({ where, data }: { where: { id: string; businessId: string }; data: Record<string, unknown> }) => {
      const rule = state.rules.find(
        (r) => r.id === where.id && r.businessId === where.businessId,
      );
      if (!rule) return { count: 0 };
      Object.assign(rule, data);
      return { count: 1 };
    }),
    deleteMany: vi.fn(async ({ where }: { where: { id: string; businessId: string } }) => {
      const before = state.rules.length;
      state.rules = state.rules.filter(
        (r) => !(r.id === where.id && r.businessId === where.businessId),
      );
      return { count: before - state.rules.length };
    }),
  },
};

beforeEach(() => {
  state.businessId = "biz-a";
  state.rows = [];
  state.rules = [];
  vi.mocked(requireAuthContext).mockImplementation(async () => ({
    prisma,
    business: { id: state.businessId, name: "A", currency: "NGN" },
    user: { id: "user-a", email: "a@example.com" },
  }) as never);
});

describe("grouped review service", () => {
  it("lists ten groups at a time, biggest total first", async () => {
    state.rows = [
      makeRow({ id: "a", description: "ZOOZ COFFEE", amount: decimal(2) }),
      makeRow({ id: "b", description: "ZOOZ COFFEE", amount: decimal(3) }),
      makeRow({
        id: "c",
        description: "MTN AIRTIME",
        amount: decimal(50),
        aiCategory: "Airtime & Data",
      }),
    ];
    const result = await listReviewGroups(0, 1);
    expect(result.totalGroups).toBe(2);
    expect(result.totalRows).toBe(3);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].merchant).toBe("MTN");
    expect(result.groups[0].rowCount).toBe(1);
  });

  it("bulk accepts a group without changing the category", async () => {
    state.rows = [
      makeRow({ id: "a", amount: decimal(10) }),
      makeRow({ id: "b", amount: decimal(15) }),
    ];
    const key = (await listReviewGroups()).groups[0].key;
    const result = await applyReviewAction({ scope: "group", groupKey: key });

    expect(result.affected).toBe(2);
    expect(result.clearedByCascade).toBe(0);
    expect(state.rows.every((row) => row.aiConfidence === null)).toBe(true);
    expect(state.rows.every((row) => row.categoryId === FOOD)).toBe(true);
    expect(result.undoToken).toContain(".");
  });

  it("accepts every remaining row with one undo token", async () => {
    state.rows = [
      makeRow({ id: "a", amount: decimal(10) }),
      makeRow({
        id: "b",
        description: "MTN AIRTIME",
        amount: decimal(20),
        aiCategory: "Airtime & Data",
      }),
    ];

    const result = await applyReviewAction({ scope: "all" });
    expect(result.affected).toBe(2);
    expect(state.rows.every((row) => row.aiConfidence === null)).toBe(true);

    expect(await undoReviewAction(result.undoToken)).toBe(2);
    expect(state.rows.every((row) => row.aiConfidence !== null)).toBe(true);
  });

  it("bulk overrides a group, learns a rule and cascades cleared rows", async () => {
    state.rows = [
      makeRow({ id: "a", amount: decimal(10) }),
      makeRow({ id: "b", amount: decimal(15) }),
      makeRow({
        id: "c",
        description: "ZOOZ COFFEE Tuesday",
        amount: decimal(30),
        aiCategory: "Shopping",
      }),
    ];
    const key = (await listReviewGroups()).groups.find(
      (group) => group.suggestedCategory === "Food",
    )!.key;
    const result = await applyReviewAction({
      scope: "group",
      groupKey: key,
      categoryId: TRANSPORT,
    });

    expect(result.affected).toBe(2);
    expect(state.rules).toHaveLength(1);
    expect(state.rules[0]).toMatchObject({
      pattern: "ZOOZ",
      categoryId: TRANSPORT,
      categoryName: "Transportation",
    });
    expect(result.clearedByCascade).toBe(1);
    const cascaded = state.rows.find((row) => row.id === "c");
    expect(cascaded).toMatchObject({ categoryId: TRANSPORT, aiConfidence: 0.94 });
  });

  it("undo restores the exact previous category and confidence and removes the rule", async () => {
    state.rows = [
      makeRow({ id: "a", amount: decimal(10) }),
      makeRow({ id: "b", amount: decimal(15) }),
    ];
    const key = (await listReviewGroups()).groups[0].key;
    const applied = await applyReviewAction({
      scope: "group",
      groupKey: key,
      categoryId: TRANSPORT,
    });
    expect(state.rules).toHaveLength(1);

    const restored = await undoReviewAction(applied.undoToken);
    expect(restored).toBe(2);
    expect(state.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "a", categoryId: FOOD }),
        expect.objectContaining({ id: "b", categoryId: FOOD }),
      ]),
    );
    for (const row of state.rows) {
      expect((row.aiConfidence as { toString(): string }).toString()).toBe("0.4000");
    }
    expect(state.rules).toHaveLength(0);
  });

  it("never applies another tenant's group or undo token", async () => {
    state.rows = [makeRow({ id: "a", businessId: "biz-b" })];
    const key = (await listReviewGroups()).groups[0]?.key ?? "ZOOZ\u0000FOOD";

    state.businessId = "biz-a";
    await expect(applyReviewAction({ scope: "group", groupKey: key })).rejects.toThrow(
      "no longer available",
    );
    expect(state.rows[0].aiConfidence).not.toBeNull();

    const foreignToken = signUndoToken({
      businessId: "biz-b",
      createdAt: Date.now(),
      changes: [{ id: "a", categoryId: null, aiConfidence: "0.4" }],
      rule: null,
    });
    await expect(undoReviewAction(foreignToken)).rejects.toThrow("Not authorised");
    expect(state.rows[0].aiConfidence).not.toBeNull();
  });
});
