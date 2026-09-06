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
  listImportHistory,
  getExistingFingerprints,
  commitImport,
} from "@/lib/services/imports";
import { categorizeImportRow } from "@/lib/import/index";
import type {
  NormalizedImportRow,
  ImportCategoryOption,
} from "@/lib/import/types";

const userA = { id: "auth-user-a", email: "a@example.com", name: "User A" };
const businessA = { id: "biz-a", name: "A Ltd", currency: "NGN" };

const SYS_OTHER_INCOME = "00000000-0000-4000-8000-000000000001";
const SYS_TRANSPORTATION = "00000000-0000-4000-8000-000000000002";
const SYS_RENT = "00000000-0000-4000-8000-000000000003";
const SYS_OTHER = "00000000-0000-4000-8000-000000000004";
const SYS_MARKETING = "00000000-0000-4000-8000-000000000005";
const SYS_FOOD = "00000000-0000-4000-8000-000000000006";
const SYS_UTILITIES = "00000000-0000-4000-8000-000000000007";

function makeDecimal(value: number) {
  return { toString: () => value.toFixed(2) };
}

function makeCategoryRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: SYS_OTHER,
    businessId: null,
    name: "Other",
    type: "expense",
    isSystem: true,
    createdAt: new Date("2026-01-10"),
    ...overrides,
  };
}

const mockPrisma = {
  business: { findFirst: vi.fn() },
  account: { findFirst: vi.fn() },
  transaction: {
    findMany: vi.fn(),
    createMany: vi.fn(),
  },
  category: { findMany: vi.fn(), findFirst: vi.fn() },
  categoryRule: { findMany: vi.fn(), upsert: vi.fn() },
  import: { findMany: vi.fn(), create: vi.fn() },
  $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockPrisma)),
};

const mockedGetPrismaClient = vi.mocked(getPrismaClient);
const mockedGetCurrentUser = vi.mocked(getCurrentUser);

beforeEach(() => {
  vi.clearAllMocks();
  mockedGetPrismaClient.mockReturnValue(mockPrisma as never);
});

const csvBytes = (text: string): Uint8Array => new TextEncoder().encode(text);

/**
 * 5-row statement:
 *   l2 UBER ride +2500.00            income, included, categorized Transportation
 *   l3 UBER ride +2500.00            duplicate-in-file of l2 (skipped)
 *   l4 Rent payment -150000.00       expense, included, categorized Rent
 *   l5 BROKEN "abc" amount           invalid (never importable)
 *   l6 Stripe payout +4000.00        duplicate of an existing DB row (skipped)
 */
const STATEMENT = [
  "Date,Description,Amount",
  "2026-01-05,UBER ride,-2500.00",
  "2026-01-05,UBER ride,-2500.00",
  "12/02/2026,Rent payment,-150000.00",
  "13/02/2026,BROKEN,abc",
  "14/02/2026,Stripe payout,+4000.00",
].join("\n");

const ALL_SELECTED = [
  { rowIndex: 0, include: true, categoryId: null },
  { rowIndex: 1, include: true, categoryId: null },
  { rowIndex: 2, include: true, categoryId: null },
  { rowIndex: 3, include: true, categoryId: null },
  { rowIndex: 4, include: true, categoryId: null },
];

function commitInput(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    fileName: "statement.csv",
    fileType: "csv",
    mapping: { date: "Date", description: "Description", amount: "Amount" },
    accountId: null,
    selections: ALL_SELECTED,
    ...overrides,
  } as Parameters<typeof commitImport>[1];
}

/**
 * The exact manual-test statement the user reported: the same merchant and
 * amount recurs on different dates ("Client payment" on 08-01 and 08-04,
 * "Office supplies" on 08-02 and 08-05) and the file never had those rows
 * flagged in review. Debit/Credit columns instead of Amount.
 */
const USER_STATEMENT = [
  "Date,Description,Debit,Credit,Category",
  "2026-08-01,Client payment,,150000,Sales",
  "2026-08-02,Office supplies,25000,,Office",
  "2026-08-03,Internet subscription,10000,,Utilities",
  "2026-08-04,Client payment,,150000,",
  "2026-08-05,Office supplies,25000,",
].join("\n");

const USER_MAPPING = {
  date: "Date",
  description: "Description",
  debit: "Debit",
  credit: "Credit",
  category: "Category",
};

const USER_ALL_SELECTED = [
  { rowIndex: 0, include: true, categoryId: null },
  { rowIndex: 1, include: true, categoryId: null },
  { rowIndex: 2, include: true, categoryId: null },
  { rowIndex: 3, include: true, categoryId: null },
  { rowIndex: 4, include: true, categoryId: null },
];

describe("listImportHistory", () => {
  beforeEach(() => {
    mockedGetCurrentUser.mockResolvedValue(userA);
    mockPrisma.business.findFirst.mockResolvedValue(businessA);
  });

  it("scopes the import list to the session business and sorts newest first", async () => {
    mockPrisma.import.findMany.mockResolvedValue([
      {
        id: "imp-1",
        businessId: businessA.id,
        accountId: null,
        filename: "sep.csv",
        fileType: "csv",
        status: "committed",
        transactionsFound: 3,
        transactionsImported: 2,
        errors: { invalidRows: 1, errors: [{ sourceRow: 4, message: "invalid amount" }] },
        createdAt: new Date("2026-09-01"),
        completedAt: new Date("2026-09-01"),
      },
    ]);

    const items = await listImportHistory(5);
    expect(items).toHaveLength(1);
    expect(mockPrisma.import.findMany.mock.calls[0][0].where.businessId).toBe(
      businessA.id,
    );
    expect(mockPrisma.import.findMany.mock.calls[0][0].orderBy.createdAt).toBe("desc");
    expect(items[0].transactionsImported).toBe(2);
    expect(items[0].errors?.invalidRows).toBe(1);
    expect(items[0].createdAt).toContain("2026");
  });

  it("returns null errors for clean imports", async () => {
    mockPrisma.import.findMany.mockResolvedValue([
      {
        id: "imp-2",
        businessId: businessA.id,
        accountId: null,
        filename: "clean.xlsx",
        fileType: "xlsx",
        status: "committed",
        transactionsFound: 1,
        transactionsImported: 1,
        errors: null,
        createdAt: new Date("2026-09-02"),
        completedAt: new Date("2026-09-02"),
      },
    ]);
    const [item] = await listImportHistory();
    expect(item.errors).toBeNull();
  });
});

describe("getExistingFingerprints", () => {
  beforeEach(() => {
    mockedGetCurrentUser.mockResolvedValue(userA);
    mockPrisma.business.findFirst.mockResolvedValue(businessA);
  });

  it("scopes to the session business and canonicalizes amounts to two decimals", async () => {
    mockPrisma.transaction.findMany.mockResolvedValue([
      {
        date: new Date("2026-02-14"),
        type: "income",
        description: "Stripe payout",
        amount: makeDecimal(4000),
        reference: null,
      },
      {
        date: new Date("2026-02-15"),
        type: "expense",
        description: "Data purchase",
        amount: makeDecimal(950.5),
        reference: null,
      },
    ]);

    const fps = await getExistingFingerprints();
    expect(fps).toHaveLength(2);
    expect(fps[0]).toContain("stripe payout");
    expect(fps[0]).toContain("4000.00");
    expect(fps[1]).toContain("950.50");
    expect(mockPrisma.transaction.findMany.mock.calls[0][0].where.businessId).toBe(
      businessA.id,
    );
  });
});

describe("commitImport", () => {
  beforeEach(() => {
    mockedGetCurrentUser.mockResolvedValue(userA);
    mockPrisma.business.findFirst.mockResolvedValue(businessA);
    mockPrisma.categoryRule.findMany.mockResolvedValue([]);
    mockPrisma.category.findFirst.mockResolvedValue(null);
  });

  it("re-derives rows from the bytes and writes only valid, included, new rows", async () => {
    // Existing DB already contains the "Stripe payout +4000 income" row on 14/02.
    mockPrisma.transaction.findMany.mockResolvedValue([
      {
        date: new Date("2026-02-14"),
        type: "income",
        description: "Stripe payout",
        amount: makeDecimal(4000),
        reference: null,
      },
    ]);
    mockPrisma.category.findMany.mockResolvedValue([
      makeCategoryRow({ id: SYS_OTHER_INCOME, name: "Other Income", type: "income" }),
      makeCategoryRow({ id: SYS_TRANSPORTATION, name: "Transportation" }),
      makeCategoryRow({ id: SYS_RENT, name: "Rent" }),
      makeCategoryRow({ id: SYS_OTHER, name: "Other" }),
    ]);
    mockPrisma.transaction.createMany.mockResolvedValue({ count: 2 });
    mockPrisma.import.create.mockResolvedValue({
      id: "imp-3",
      businessId: businessA.id,
      filename: "statement.csv",
    });

    const result = await commitImport(csvBytes(STATEMENT), commitInput());

    expect(result.total).toBe(5);
    expect(result.imported).toBe(2);
    // Row 4 (Stripe) already exists in the ledger; row 1 (UBER) is an
    // exact duplicate of the already-committed row 0 within this file.
    expect(result.existingDuplicates).toBe(1);
    expect(result.inFileDuplicates).toBe(1);
    expect(result.invalid).toBe(1);
    expect(result.excluded).toBe(0);

    // createMany received exactly the two imported rows.
    const created = mockPrisma.transaction.createMany.mock.calls[0][0].data as Array<
      Record<string, unknown>
    >;
    expect(created).toHaveLength(2);

    const uber = created.find((t) => t.description === "UBER ride");
    expect(uber).toMatchObject({
      businessId: businessA.id,
      accountId: null,
      type: "expense",
      amount: "2500.00",
      source: "csv",
      categoryId: SYS_TRANSPORTATION,
      aiCategory: "Transportation",
    });

    const rent = created.find((t) => t.description === "Rent payment");
    expect(rent).toMatchObject({
      type: "expense",
      amount: "150000.00",
      categoryId: SYS_RENT,
      aiCategory: "Rent",
    });

    // Import ledger record mirrors the run.
    const importData = mockPrisma.import.create.mock.calls[0][0].data as Record<
      string,
      unknown
    >;
    expect(importData.status).toBe("committed");
    expect(importData.transactionsFound).toBe(5);
    expect(importData.transactionsImported).toBe(2);
    expect(importData.fileType).toBe("csv");
    expect(importData.errors).toMatchObject({
      invalidRows: 1,
      existingDuplicates: 1,
      inFileDuplicates: 1,
      excluded: 0,
    });
  });

  it("flags same-merchant rows on different dates and excludes them by default", async () => {
    mockPrisma.transaction.findMany.mockResolvedValue([]);
    mockPrisma.category.findMany.mockResolvedValue([makeCategoryRow()]);
    mockPrisma.transaction.createMany.mockResolvedValue({ count: 3 });
    mockPrisma.import.create.mockResolvedValue({ id: "imp-9" });

    // Conservative default selection (what the wizard produces): only the
    // three "new" rows are INCLUDED, rows 3 and 4 (in-file duplicates on
    // later dates) are not.
    const result = await commitImport(
      csvBytes(USER_STATEMENT),
      commitInput({
        fileName: "user.csv",
        mapping: USER_MAPPING,
        selections: [
          { rowIndex: 0, include: true, categoryId: null },
          { rowIndex: 1, include: true, categoryId: null },
          { rowIndex: 2, include: true, categoryId: null },
          { rowIndex: 3, include: false, categoryId: null },
          { rowIndex: 4, include: false, categoryId: null },
        ],
      }),
    );
    expect(result.total).toBe(5);
    expect(result.imported).toBe(3);
    expect(result.excluded).toBe(2);
    expect(result.inFileDuplicates).toBe(0);
    expect(result.existingDuplicates).toBe(0);
    expect(result.invalid).toBe(0);
  });

  it("keeps duplicate-dated rows when the user explicitly selects them (unique exact rows only)", async () => {
    mockPrisma.transaction.findMany.mockResolvedValue([]);
    mockPrisma.category.findMany.mockResolvedValue([makeCategoryRow()]);
    mockPrisma.transaction.createMany.mockResolvedValue({ count: 5 });
    mockPrisma.import.create.mockResolvedValue({ id: "imp-10" });

    const result = await commitImport(
      csvBytes(USER_STATEMENT),
      commitInput({ fileName: "user.csv", mapping: USER_MAPPING, selections: USER_ALL_SELECTED }),
    );
    expect(result.total).toBe(5);
    expect(result.imported).toBe(5);
    // Different dates -> the exact (date-bearing) rows are distinct, so
    // nothing is counted as an in-file duplicate and none are lost.
    expect(result.inFileDuplicates).toBe(0);
    expect(result.excluded).toBe(0);
    expect(result.existingDuplicates).toBe(0);
  });

  it("reports existing duplicates and in-file duplicates in one commit summary", async () => {
    // "Client payment" 08-01 and "Internet subscription" 08-03 already exist.
    mockPrisma.transaction.findMany.mockResolvedValue([
      { date: new Date("2026-08-01"), type: "income", description: "Client payment", amount: makeDecimal(150000), reference: null },
      { date: new Date("2026-08-03"), type: "expense", description: "Internet subscription", amount: makeDecimal(10000), reference: null },
    ]);
    mockPrisma.category.findMany.mockResolvedValue([makeCategoryRow()]);
    mockPrisma.transaction.createMany.mockResolvedValue({ count: 3 });
    mockPrisma.import.create.mockResolvedValue({ id: "imp-11" });

    const result = await commitImport(
      csvBytes(USER_STATEMENT),
      commitInput({ fileName: "user.csv", mapping: USER_MAPPING, selections: USER_ALL_SELECTED }),
    );
    expect(result.total).toBe(5);
    expect(result.imported).toBe(3); // 08-02 supplies, 08-04 payment, 08-05 supplies
    expect(result.existingDuplicates).toBe(2);
    expect(result.inFileDuplicates).toBe(0);
    expect(result.excluded).toBe(0);
    expect(result.invalid).toBe(0);
  });

  it("re-importing a fully committed statement reports 0 imported and 5 existing duplicates", async () => {
    mockPrisma.transaction.findMany.mockResolvedValue([
      { date: new Date("2026-08-01"), type: "income", description: "Client payment", amount: makeDecimal(150000), reference: null },
      { date: new Date("2026-08-02"), type: "expense", description: "Office supplies", amount: makeDecimal(25000), reference: null },
      { date: new Date("2026-08-03"), type: "expense", description: "Internet subscription", amount: makeDecimal(10000), reference: null },
      { date: new Date("2026-08-04"), type: "income", description: "Client payment", amount: makeDecimal(150000), reference: null },
      { date: new Date("2026-08-05"), type: "expense", description: "Office supplies", amount: makeDecimal(25000), reference: null },
    ]);
    mockPrisma.category.findMany.mockResolvedValue([makeCategoryRow()]);
    mockPrisma.transaction.createMany.mockResolvedValue({ count: 0 });
    mockPrisma.import.create.mockResolvedValue({ id: "imp-12" });

    const result = await commitImport(
      csvBytes(USER_STATEMENT),
      commitInput({ fileName: "user.csv", mapping: USER_MAPPING, selections: USER_ALL_SELECTED }),
    );
    // The confusing "Committed 0/5 rows" case from manual testing.
    expect(result.total).toBe(5);
    expect(result.imported).toBe(0);
    expect(result.existingDuplicates).toBe(5);
    expect(result.invalid).toBe(0);
    expect(result.excluded).toBe(0);
    expect(mockPrisma.transaction.createMany).not.toHaveBeenCalled();
  });

  it("skips duplicates that already exist in the ledger even when included", async () => {
    // Everything in the file matches an existing row (same events).
    mockPrisma.transaction.findMany.mockResolvedValue([
      { date: new Date("2026-01-05"), type: "expense", description: "UBER ride", amount: makeDecimal(2500), reference: null },
      { date: new Date("2026-02-12"), type: "expense", description: "Rent payment", amount: makeDecimal(150000), reference: null },
      { date: new Date("2026-02-13"), type: "expense", description: "BROKEN", amount: makeDecimal(1), reference: null },
      { date: new Date("2026-02-14"), type: "income", description: "Stripe payout", amount: makeDecimal(4000), reference: null },
    ]);
    mockPrisma.category.findMany.mockResolvedValue([makeCategoryRow()]);
    mockPrisma.transaction.createMany.mockResolvedValue({ count: 0 });
    mockPrisma.import.create.mockResolvedValue({ id: "imp-4" });

    const result = await commitImport(csvBytes(STATEMENT), commitInput());
    expect(result.imported).toBe(0);
    expect(result.existingDuplicates).toBe(4);
    expect(result.invalid).toBe(1);
    expect(result.excluded).toBe(0);
    expect(mockPrisma.transaction.createMany).not.toHaveBeenCalled();
  });

  it("honors user category overrides and falls back to Other for unknown rows", async () => {
    const statement = ["Date,Description,Amount", "2026-03-01,Mystery charge,-300.00"].join("\n");
    mockPrisma.transaction.findMany.mockResolvedValue([]);
    mockPrisma.category.findMany.mockResolvedValue([
      makeCategoryRow({ id: SYS_OTHER_INCOME, name: "Other Income", type: "income" }),
      makeCategoryRow({ id: SYS_OTHER, name: "Other" }),
    ]);
    mockPrisma.transaction.createMany.mockResolvedValue({ count: 1 });
    mockPrisma.import.create.mockResolvedValue({ id: "imp-5" });

    const result = await commitImport(
      csvBytes(statement),
      commitInput({
        fileName: "one.csv",
        selections: [{ rowIndex: 0, include: true, categoryId: SYS_OTHER }],
      }),
    );
    expect(result.imported).toBe(1);
    const created = mockPrisma.transaction.createMany.mock.calls[0][0].data[0] as Record<
      string,
      unknown
    >;
    expect(created.categoryId).toBe(SYS_OTHER);
    expect(created.aiCategory).toBe("Other");
  });

  it("rejects a mapping whose columns do not exist in the file", async () => {
    await expect(
      commitImport(
        csvBytes(STATEMENT),
        commitInput({ mapping: { date: "Date", description: "Nope", amount: "Amount" } }),
      ),
    ).rejects.toThrow("Column mapping problem");
  });

  it("skips rows the user did not select", async () => {
    mockPrisma.transaction.findMany.mockResolvedValue([]);
    mockPrisma.category.findMany.mockResolvedValue([makeCategoryRow()]);
    mockPrisma.transaction.createMany.mockResolvedValue({ count: 1 });
    mockPrisma.import.create.mockResolvedValue({ id: "imp-6" });

    const result = await commitImport(
      csvBytes(STATEMENT),
      commitInput({
        selections: [{ rowIndex: 0, include: true, categoryId: null }],
      }),
    );
    expect(result.imported).toBe(1);
    // The valid Rent row, the duplicate UBER row, and the valid Stripe
    // row are all deselected.
    expect(result.excluded).toBe(3);
    expect(result.existingDuplicates).toBe(0);
    expect(result.inFileDuplicates).toBe(0);
    expect(result.invalid).toBe(1);
  });

  it("never attaches an account that belongs to another business", async () => {
    mockPrisma.transaction.findMany.mockResolvedValue([]);
    mockPrisma.category.findMany.mockResolvedValue([makeCategoryRow()]);
    mockPrisma.transaction.createMany.mockResolvedValue({ count: 1 });
    mockPrisma.import.create.mockResolvedValue({ id: "imp-7" });
    // The account is not found for this business -> the id is scrubbed.
    mockPrisma.account.findFirst.mockResolvedValue(undefined);

    const result = await commitImport(
      csvBytes(["Date,Description,Amount", "2026-03-01,Mystery charge,-300.00"].join("\n")),
      commitInput({ accountId: "acc-other-biz", fileName: "one.csv" }),
    );
    expect(result.imported).toBe(1);
    const created = mockPrisma.transaction.createMany.mock.calls[0][0].data[0] as Record<
      string,
      unknown
    >;
    expect(created.accountId).toBeNull();
    expect(mockPrisma.account.findFirst.mock.calls[0][0].where).toEqual({
      id: "acc-other-biz",
      businessId: businessA.id,
    });
  });

  // ---------------------------------------------------------------
  // Learning category rules from review corrections (Phase 7)
  // ---------------------------------------------------------------

  const COMMON_CATEGORIES = [
    makeCategoryRow({ id: SYS_OTHER_INCOME, name: "Other Income", type: "income" }),
    makeCategoryRow({ id: SYS_TRANSPORTATION, name: "Transportation" }),
    makeCategoryRow({ id: SYS_UTILITIES, name: "Utilities" }),
    makeCategoryRow({ id: SYS_RENT, name: "Rent" }),
    makeCategoryRow({ id: SYS_MARKETING, name: "Marketing" }),
    makeCategoryRow({ id: SYS_FOOD, name: "Food" }),
    makeCategoryRow({ id: SYS_OTHER, name: "Other" }),
  ];

  it("remembers a review override as a merchant rule and keeps the suggestion confidence", async () => {
    const statement = ["Date,Description,Amount", "2026-03-01,AIRTEL RECHARGE 500MB,-2500.00"].join("\n");
    mockPrisma.transaction.findMany.mockResolvedValue([]);
    mockPrisma.category.findMany.mockResolvedValue(COMMON_CATEGORIES);
    mockPrisma.category.findFirst.mockResolvedValue({ id: SYS_MARKETING });
    mockPrisma.categoryRule.findMany.mockResolvedValue([]);
    mockPrisma.transaction.createMany.mockResolvedValue({ count: 1 });
    mockPrisma.import.create.mockResolvedValue({ id: "imp-learn-1" });

    const result = await commitImport(
      csvBytes(statement),
      commitInput({
        fileName: "learn.csv",
        selections: [{ rowIndex: 0, include: true, categoryId: SYS_MARKETING }],
      }),
    );

    expect(result.imported).toBe(1);
    expect(result.learnedRuleCount).toBe(1);

    const created = mockPrisma.transaction.createMany.mock.calls[0][0].data[0] as Record<
      string,
      unknown
    >;
    expect(created).toMatchObject({
      categoryId: SYS_MARKETING,
      aiCategory: "Marketing",
      aiConfidence: 0.94,
    });

    const upsertCall = mockPrisma.categoryRule.upsert.mock.calls[0][0] as Record<string, unknown>;
    expect(upsertCall.where).toEqual({
      businessId_matchType_pattern: {
        businessId: businessA.id,
        matchType: "merchant",
        pattern: "AIRTEL",
      },
    });
    expect(upsertCall.create).toMatchObject({
      businessId: businessA.id,
      matchType: "merchant",
      pattern: "AIRTEL",
      categoryId: SYS_MARKETING,
      categoryName: "Marketing",
    });
  });

  it("does not learn when the user keeps the categorizer suggestion", async () => {
    const statement = ["Date,Description,Amount", "2026-03-01,MTN data recharge,-3000.00"].join("\n");
    mockPrisma.transaction.findMany.mockResolvedValue([]);
    mockPrisma.category.findMany.mockResolvedValue(COMMON_CATEGORIES);
    mockPrisma.categoryRule.findMany.mockResolvedValue([]);
    mockPrisma.transaction.createMany.mockResolvedValue({ count: 1 });
    mockPrisma.import.create.mockResolvedValue({ id: "imp-learn-2" });

    const result = await commitImport(
      csvBytes(statement),
      commitInput({ fileName: "keep.csv", selections: [{ rowIndex: 0, include: true, categoryId: null }] }),
    );

    expect(result.imported).toBe(1);
    expect(result.learnedRuleCount).toBe(0);
    expect(mockPrisma.categoryRule.upsert).not.toHaveBeenCalled();

    const created = mockPrisma.transaction.createMany.mock.calls[0][0].data[0] as Record<
      string,
      unknown
    >;
    expect(created).toMatchObject({ categoryId: SYS_UTILITIES, aiCategory: "Utilities" });
  });

  it("never learns from a row that already carried a category in the file", async () => {
    const statement = ["Date,Description,Amount,Category", "2026-03-01,AIRTEL RECHARGE 500MB,-2500.00,Utilities"].join("\n");
    mockPrisma.transaction.findMany.mockResolvedValue([]);
    mockPrisma.category.findMany.mockResolvedValue(COMMON_CATEGORIES);
    mockPrisma.categoryRule.findMany.mockResolvedValue([]);
    mockPrisma.transaction.createMany.mockResolvedValue({ count: 1 });
    mockPrisma.import.create.mockResolvedValue({ id: "imp-learn-3" });

    const result = await commitImport(
      csvBytes(statement),
      commitInput({
        fileName: "filecat.csv",
        mapping: { date: "Date", description: "Description", amount: "Amount", category: "Category" },
        selections: [{ rowIndex: 0, include: true, categoryId: SYS_MARKETING }],
      }),
    );

    expect(result.imported).toBe(1);
    expect(result.learnedRuleCount).toBe(0);
    expect(mockPrisma.categoryRule.upsert).not.toHaveBeenCalled();

    const created = mockPrisma.transaction.createMany.mock.calls[0][0].data[0] as Record<
      string,
      unknown
    >;
    expect(created.categoryId).toBe(SYS_MARKETING);
  });

  it("dedupes identical corrections for the same merchant into a single rule", async () => {
    const statement = [
      "Date,Description,Amount",
      "2026-03-01,UBER *TRIP,-2500.00",
      "2026-03-02,UBER RIDE,-1500.00",
    ].join("\n");
    mockPrisma.transaction.findMany.mockResolvedValue([]);
    mockPrisma.category.findMany.mockResolvedValue(COMMON_CATEGORIES);
    mockPrisma.category.findFirst.mockResolvedValue({ id: SYS_MARKETING });
    mockPrisma.categoryRule.findMany.mockResolvedValue([]);
    mockPrisma.transaction.createMany.mockResolvedValue({ count: 2 });
    mockPrisma.import.create.mockResolvedValue({ id: "imp-learn-4" });

    const result = await commitImport(
      csvBytes(statement),
      commitInput({
        fileName: "dedupe.csv",
        selections: [
          { rowIndex: 0, include: true, categoryId: SYS_MARKETING },
          { rowIndex: 1, include: true, categoryId: SYS_MARKETING },
        ],
      }),
    );

    expect(result.imported).toBe(2);
    expect(result.learnedRuleCount).toBe(1);
    expect(mockPrisma.categoryRule.upsert).toHaveBeenCalledTimes(1);
    const upsertCall = mockPrisma.categoryRule.upsert.mock.calls[0][0] as Record<string, unknown>;
    expect(upsertCall.where).toEqual({
      businessId_matchType_pattern: { businessId: businessA.id, matchType: "merchant", pattern: "UBER" },
    });
  });

  it("learns nothing when the same merchant was corrected to different categories", async () => {
    const statement = [
      "Date,Description,Amount",
      "2026-03-01,UBER *TRIP,-2500.00",
      "2026-03-02,UBER RIDE,-1500.00",
    ].join("\n");
    mockPrisma.transaction.findMany.mockResolvedValue([]);
    mockPrisma.category.findMany.mockResolvedValue(COMMON_CATEGORIES);
    mockPrisma.categoryRule.findMany.mockResolvedValue([]);
    mockPrisma.transaction.createMany.mockResolvedValue({ count: 2 });
    mockPrisma.import.create.mockResolvedValue({ id: "imp-learn-5" });

    const result = await commitImport(
      csvBytes(statement),
      commitInput({
        fileName: "conflict.csv",
        selections: [
          { rowIndex: 0, include: true, categoryId: SYS_MARKETING },
          { rowIndex: 1, include: true, categoryId: SYS_FOOD },
        ],
      }),
    );

    expect(result.imported).toBe(2);
    expect(result.learnedRuleCount).toBe(0);
    expect(mockPrisma.categoryRule.upsert).not.toHaveBeenCalled();
  });

  it("never fails the import when learning a rule fails", async () => {
    const statement = ["Date,Description,Amount", "2026-03-01,AIRTEL RECHARGE 500MB,-2500.00"].join("\n");
    mockPrisma.transaction.findMany.mockResolvedValue([]);
    mockPrisma.category.findMany.mockResolvedValue(COMMON_CATEGORIES);
    mockPrisma.category.findFirst.mockResolvedValue({ id: SYS_MARKETING });
    mockPrisma.categoryRule.findMany.mockResolvedValue([]);
    mockPrisma.categoryRule.upsert.mockRejectedValue(new Error("db down"));
    mockPrisma.transaction.createMany.mockResolvedValue({ count: 1 });
    mockPrisma.import.create.mockResolvedValue({ id: "imp-learn-6" });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await commitImport(
      csvBytes(statement),
      commitInput({
        fileName: "flaky.csv",
        selections: [{ rowIndex: 0, include: true, categoryId: SYS_MARKETING }],
      }),
    );

    expect(result.imported).toBe(1);
    expect(result.learnedRuleCount).toBe(0);
    expect(mockPrisma.import.create).toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("applies a learned rule at commit exactly like the preview would", async () => {
    const statement = ["Date,Description,Amount", "2026-03-01,AIRTEL RECHARGE 500MB,-2500.00"].join("\n");
    mockPrisma.transaction.findMany.mockResolvedValue([]);
    mockPrisma.category.findMany.mockResolvedValue(COMMON_CATEGORIES);
    mockPrisma.categoryRule.findMany.mockResolvedValue([
      {
        id: "rule-airtel",
        businessId: businessA.id,
        matchType: "merchant",
        pattern: "AIRTEL",
        categoryId: SYS_MARKETING,
        categoryName: "Marketing",
        createdAt: new Date("2026-09-01T00:00:00.000Z"),
      },
    ]);
    mockPrisma.transaction.createMany.mockResolvedValue({ count: 1 });
    mockPrisma.import.create.mockResolvedValue({ id: "imp-learn-7" });

    const result = await commitImport(
      csvBytes(statement),
      commitInput({ fileName: "rule.csv" }),
    );

    expect(result.imported).toBe(1);
    expect(result.learnedRuleCount).toBe(0);
    expect(mockPrisma.categoryRule.upsert).not.toHaveBeenCalled();

    const created = mockPrisma.transaction.createMany.mock.calls[0][0].data[0] as Record<
      string,
      unknown
    >;
    expect(created).toMatchObject({
      categoryId: SYS_MARKETING,
      aiCategory: "Marketing",
      aiConfidence: 0.94,
    });
  });

  // ---------------------------------------------------------------
  // "Import anyway" — rows that already exist in the ledger (Phase 6 gap)
  // ---------------------------------------------------------------

  const IMPORT_ANYWAY_STATEMENT = [
    "Date,Description,Amount",
    "2026-08-01,SHOPRITE MALL,-15000.00",
    "2026-08-02,UBER TRIP,-3000.00",
    "2026-08-03,AIRTEL RECHARGE 500MB,-2500.00",
  ].join("\n");

  const IMPORT_ANYWAY_EXISTING = [
    { date: new Date("2026-08-01"), type: "expense", description: "SHOPRITE MALL", amount: makeDecimal(15000), reference: null },
    { date: new Date("2026-08-02"), type: "expense", description: "UBER TRIP", amount: makeDecimal(3000), reference: null },
    { date: new Date("2026-08-03"), type: "expense", description: "AIRTEL RECHARGE 500MB", amount: makeDecimal(2500), reference: null },
  ];

  it("commits rows marked Import anyway even when they already exist, and learns corrections", async () => {
    mockPrisma.transaction.findMany.mockResolvedValue(IMPORT_ANYWAY_EXISTING);
    mockPrisma.category.findMany.mockResolvedValue(COMMON_CATEGORIES);
    mockPrisma.category.findFirst.mockResolvedValue({ id: SYS_FOOD });
    mockPrisma.categoryRule.findMany.mockResolvedValue([]);
    mockPrisma.categoryRule.upsert.mockReset();
    mockPrisma.categoryRule.upsert.mockResolvedValue({} as never);
    mockPrisma.transaction.createMany.mockResolvedValue({ count: 3 });
    mockPrisma.import.create.mockResolvedValue({ id: "imp-anyway-1" });

    const result = await commitImport(
      csvBytes(IMPORT_ANYWAY_STATEMENT),
      commitInput({
        fileName: "anyway.csv",
        selections: [
          { rowIndex: 0, include: true, importAnyway: true, categoryId: SYS_FOOD },
          { rowIndex: 1, include: true, importAnyway: true, categoryId: null },
          { rowIndex: 2, include: true, importAnyway: true, categoryId: null },
        ],
      }),
    );

    expect(result.total).toBe(3);
    expect(result.imported).toBe(3);
    expect(result.existingDuplicates).toBe(0);
    expect(result.inFileDuplicates).toBe(0);
    expect(result.excluded).toBe(0);
    expect(result.invalid).toBe(0);
    expect(result.learnedRuleCount).toBe(1);

    const created = mockPrisma.transaction.createMany.mock.calls[0][0].data as Array<
      Record<string, unknown>
    >;
    expect(created).toHaveLength(3);
    const shoprite = created.find((t) => t.description === "SHOPRITE MALL");
    expect(shoprite).toMatchObject({
      categoryId: SYS_FOOD,
      aiCategory: "Food",
    });

    const upsertCall = mockPrisma.categoryRule.upsert.mock.calls[0][0] as Record<string, unknown>;
    expect(upsertCall.where).toEqual({
      businessId_matchType_pattern: {
        businessId: businessA.id,
        matchType: "merchant",
        pattern: "SHOPRITE",
      },
    });
    expect(upsertCall.create).toMatchObject({
      businessId: businessA.id,
      matchType: "merchant",
      pattern: "SHOPRITE",
      categoryId: SYS_FOOD,
      categoryName: "Food",
    });
  });

  it("skips existing duplicates not marked Import anyway and never learns from them", async () => {
    mockPrisma.transaction.findMany.mockResolvedValue(IMPORT_ANYWAY_EXISTING);
    mockPrisma.category.findMany.mockResolvedValue(COMMON_CATEGORIES);
    mockPrisma.categoryRule.findMany.mockResolvedValue([]);
    mockPrisma.transaction.createMany.mockResolvedValue({ count: 0 });
    mockPrisma.import.create.mockResolvedValue({ id: "imp-anyway-2" });

    const result = await commitImport(
      csvBytes(IMPORT_ANYWAY_STATEMENT),
      commitInput({
        fileName: "anyway-off.csv",
        selections: [
          { rowIndex: 0, include: true, categoryId: SYS_FOOD },
          { rowIndex: 1, include: true, categoryId: null },
          { rowIndex: 2, include: true, categoryId: null },
        ],
      }),
    );

    expect(result.total).toBe(3);
    expect(result.imported).toBe(0);
    expect(result.existingDuplicates).toBe(3);
    expect(result.learnedRuleCount).toBe(0);
    expect(mockPrisma.transaction.createMany).not.toHaveBeenCalled();
    expect(mockPrisma.categoryRule.upsert).not.toHaveBeenCalled();
  });

  it("keeps in-file duplicate suppression for rows marked Import anyway", async () => {
    const inFileDup = [
      "Date,Description,Amount",
      "2026-03-01,Mystery charge,-300.00",
      "2026-03-01,Mystery charge,-300.00",
    ].join("\n");
    mockPrisma.transaction.findMany.mockResolvedValue([]);
    mockPrisma.category.findMany.mockResolvedValue(COMMON_CATEGORIES);
    mockPrisma.categoryRule.findMany.mockResolvedValue([]);
    mockPrisma.transaction.createMany.mockResolvedValue({ count: 1 });
    mockPrisma.import.create.mockResolvedValue({ id: "imp-anyway-3" });

    const result = await commitImport(
      csvBytes(inFileDup),
      commitInput({
        fileName: "anyway-infiledup.csv",
        selections: [
          { rowIndex: 0, include: true, importAnyway: true, categoryId: null },
          { rowIndex: 1, include: true, importAnyway: true, categoryId: null },
        ],
      }),
    );

    expect(result.total).toBe(2);
    expect(result.imported).toBe(1);
    expect(result.inFileDuplicates).toBe(1);
    expect(result.existingDuplicates).toBe(0);
    expect(mockPrisma.transaction.createMany.mock.calls[0][0].data).toHaveLength(1);
  });

  // ---------------------------------------------------------------
  // Type-aware rules (Phase 7B-1): built-ins + learned rules only apply
  // when the target category type matches the row type.
  // ---------------------------------------------------------------

  it("suggests Other (needs review) for an INCOME MTN row and commits it to Other Income", async () => {
    const statement = ["Date,Description,Amount", "2026-03-01,PAYMENT - MTN MOBILE MONEY,+5000.00"].join("\n");
    mockPrisma.transaction.findMany.mockResolvedValue([]);
    mockPrisma.category.findMany.mockResolvedValue(COMMON_CATEGORIES);
    mockPrisma.categoryRule.upsert.mockReset();
    mockPrisma.categoryRule.upsert.mockResolvedValue({} as never);
    mockPrisma.categoryRule.findMany.mockResolvedValue([]);
    mockPrisma.transaction.createMany.mockResolvedValue({ count: 1 });
    mockPrisma.import.create.mockResolvedValue({ id: "imp-type-income-mtn" });

    const result = await commitImport(
      csvBytes(statement),
      commitInput({ fileName: "income-mtn.csv" }),
    );
    expect(result.imported).toBe(1);

    const created = mockPrisma.transaction.createMany.mock.calls[0][0].data[0] as Record<
      string,
      unknown
    >;
    // The expense built-in Utilities rule must NOT be suggested for income,
    // so the row falls to Other Income.
    expect(created).toMatchObject({
      type: "income",
      categoryId: SYS_OTHER_INCOME,
      aiCategory: "Other Income",
    });
  });

  it("suggests Utilities for an EXPENSE MTN row and commits it to Utilities", async () => {
    const statement = ["Date,Description,Amount", "2026-03-01,PAYMENT - MTN MOBILE MONEY,-5000.00"].join("\n");
    mockPrisma.transaction.findMany.mockResolvedValue([]);
    mockPrisma.category.findMany.mockResolvedValue(COMMON_CATEGORIES);
    mockPrisma.categoryRule.upsert.mockReset();
    mockPrisma.categoryRule.upsert.mockResolvedValue({} as never);
    mockPrisma.categoryRule.findMany.mockResolvedValue([]);
    mockPrisma.transaction.createMany.mockResolvedValue({ count: 1 });
    mockPrisma.import.create.mockResolvedValue({ id: "imp-type-expense-mtn" });

    const result = await commitImport(
      csvBytes(statement),
      commitInput({ fileName: "expense-mtn.csv" }),
    );
    expect(result.imported).toBe(1);

    const created = mockPrisma.transaction.createMany.mock.calls[0][0].data[0] as Record<
      string,
      unknown
    >;
    expect(created).toMatchObject({
      type: "expense",
      categoryId: SYS_UTILITIES,
      aiCategory: "Utilities",
    });
  });

  it("does not let a wrong-type learned rule leak into an income row", async () => {
    // SHOPRITE is learned to Food (expense). An INCOME SHOPRITE row must NOT
    // be funneled to Food — the expense-targeting rule is dropped for income.
    const statement = ["Date,Description,Amount", "2026-03-01,SHOPRITE MALL,+22000.00"].join("\n");
    mockPrisma.transaction.findMany.mockResolvedValue([]);
    mockPrisma.category.findMany.mockResolvedValue(COMMON_CATEGORIES);
    mockPrisma.categoryRule.upsert.mockReset();
    mockPrisma.categoryRule.upsert.mockResolvedValue({} as never);
    mockPrisma.categoryRule.findMany.mockResolvedValue([
      {
        id: "rule-shoprite",
        businessId: businessA.id,
        matchType: "merchant",
        pattern: "SHOPRITE",
        categoryId: SYS_FOOD,
        categoryName: "Food",
        createdAt: new Date("2026-09-01T00:00:00.000Z"),
      },
    ]);
    mockPrisma.transaction.createMany.mockResolvedValue({ count: 1 });
    mockPrisma.import.create.mockResolvedValue({ id: "imp-type-leak" });

    const result = await commitImport(
      csvBytes(statement),
      commitInput({ fileName: "income-shoprite.csv" }),
    );
    expect(result.imported).toBe(1);

    const created = mockPrisma.transaction.createMany.mock.calls[0][0].data[0] as Record<
      string,
      unknown
    >;
    expect(created).toMatchObject({
      type: "income",
      categoryId: SYS_OTHER_INCOME,
      aiCategory: "Other Income",
    });
    expect(created.categoryId).not.toBe(SYS_FOOD);
  });

  it("keeps transfers transfer-only (no category, never a type mismatch)", async () => {
    const statement = ["Date,Description,Type,Amount", "2026-03-01,MOBILE MONEY,transfer,15000.00"].join("\n");
    mockPrisma.transaction.findMany.mockResolvedValue([]);
    mockPrisma.category.findMany.mockResolvedValue(COMMON_CATEGORIES);
    mockPrisma.categoryRule.upsert.mockReset();
    mockPrisma.categoryRule.upsert.mockResolvedValue({} as never);
    mockPrisma.categoryRule.findMany.mockResolvedValue([]);
    mockPrisma.transaction.createMany.mockResolvedValue({ count: 1 });
    mockPrisma.import.create.mockResolvedValue({ id: "imp-type-transfer" });

    const result = await commitImport(
      csvBytes(statement),
      commitInput({
        fileName: "transfer.csv",
        mapping: { date: "Date", description: "Description", type: "Type", amount: "Amount" },
      }),
    );
    expect(result.imported).toBe(1);

    const created = mockPrisma.transaction.createMany.mock.calls[0][0].data[0] as Record<
      string,
      unknown
    >;
    expect(created.type).toBe("transfer");
    expect(created.categoryId).toBeNull();
  });

  it("produces the same type split in the preview and the commit for MTN income", async () => {
    // Preview path (deterministic, no DB mocks) versus commit path.
    const options: ImportCategoryOption[] = [
      { id: SYS_OTHER_INCOME, name: "Other Income", type: "income" },
      { id: SYS_UTILITIES, name: "Utilities", type: "expense" },
      { id: SYS_TRANSPORTATION, name: "Transportation", type: "expense" },
      { id: SYS_OTHER, name: "Other", type: "expense" },
    ];
    const incomeRow: NormalizedImportRow = {
      rowIndex: 0,
      sourceRow: 2,
      date: "2026-03-01",
      rawDate: "01/03/2026",
      description: "PAYMENT - MTN MOBILE MONEY",
      amount: "5000.00",
      type: "income",
      reference: null,
      category: null,
      errors: [],
      warnings: [],
    };
    const preview = await categorizeImportRow(incomeRow, { categoryOptions: options });
    // The engine flags the income MTN as unmatched (built-in Utilities is
    // expense-only). The preview label is now the income fallback "Other
    // Income" so it matches what the commit writes below.
    expect(preview.categoryName).toBe("Other Income");
    expect(preview.needsReview).toBe(true);

    // The commit path must resolve that suggestion to the Other Income option.
    mockPrisma.transaction.findMany.mockResolvedValue([]);
    mockPrisma.category.findMany.mockResolvedValue(COMMON_CATEGORIES);
    mockPrisma.categoryRule.upsert.mockReset();
    mockPrisma.categoryRule.upsert.mockResolvedValue({} as never);
    mockPrisma.categoryRule.findMany.mockResolvedValue([]);
    mockPrisma.transaction.createMany.mockResolvedValue({ count: 1 });
    mockPrisma.import.create.mockResolvedValue({ id: "imp-type-parity" });

    const statement = ["Date,Description,Amount", "2026-03-01,PAYMENT - MTN MOBILE MONEY,+5000.00"].join("\n");
    const result = await commitImport(
      csvBytes(statement),
      commitInput({ fileName: "parity.csv" }),
    );
    expect(result.imported).toBe(1);
    const created = mockPrisma.transaction.createMany.mock.calls[0][0].data[0] as Record<
      string,
      unknown
    >;
    expect(created).toMatchObject({ categoryId: SYS_OTHER_INCOME, aiCategory: "Other Income" });
  });
});