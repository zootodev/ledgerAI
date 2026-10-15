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
import { getOverviewActionItems } from "@/lib/services/overview";
import { REVIEW_THRESHOLD } from "@/lib/ai/rules";

const userA = { id: "auth-user-a", email: "a@example.com", name: "User A" };
const businessA = { id: "biz-a", name: "A Ltd", currency: "GBP" };

const mockedGetPrismaClient = vi.mocked(getPrismaClient);
const mockedGetCurrentUser = vi.mocked(getCurrentUser);

const mockPrisma = {
  business: { findFirst: vi.fn() },
  transaction: { count: vi.fn() },
  import: { findFirst: vi.fn() },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockedGetPrismaClient.mockReturnValue(mockPrisma as never);
  mockedGetCurrentUser.mockResolvedValue(userA);
  mockPrisma.business.findFirst.mockResolvedValue(businessA);
});

describe("getOverviewActionItems (tenant-scoped)", () => {
  it("scopes both counts and the latest import to the session business", async () => {
    mockPrisma.transaction.count
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(2);
    mockPrisma.import.findFirst.mockResolvedValue(null);

    const result = await getOverviewActionItems();

    const [uncategorizedArgs] = mockPrisma.transaction.count.mock.calls[0];
    expect(uncategorizedArgs.where).toEqual({
      businessId: businessA.id,
      categoryId: null,
      type: { not: "transfer" },
    });

    const [lowConfArgs] = mockPrisma.transaction.count.mock.calls[1];
    expect(lowConfArgs.where.businessId).toBe(businessA.id);
    expect(lowConfArgs.where.aiConfidence).toEqual({ lt: REVIEW_THRESHOLD });

    const [importArgs] = mockPrisma.import.findFirst.mock.calls[0];
    expect(importArgs.where).toEqual({ businessId: businessA.id });
    expect(importArgs.orderBy).toEqual({ createdAt: "desc" });

    expect(result).toEqual({
      uncategorizedCount: 3,
      lowConfidenceCount: 2,
      latestImport: null,
    });
  });

  it("maps the latest import outcome from the errors JSON", async () => {
    mockPrisma.transaction.count.mockResolvedValue(0);
    mockPrisma.import.findFirst.mockResolvedValue({
      id: "imp-1",
      businessId: businessA.id,
      filename: "statement.pdf",
      transactionsFound: 42,
      transactionsImported: 40,
      errors: { invalidRows: 1, existingDuplicates: 1 },
      createdAt: new Date("2026-01-05T10:00:00.000Z"),
    });

    const result = await getOverviewActionItems();

    expect(result.latestImport).toEqual({
      id: "imp-1",
      filename: "statement.pdf",
      imported: 40,
      found: 42,
      existingDuplicates: 1,
      invalidRows: 1,
      createdAt: "2026-01-05T10:00:00.000Z",
    });
  });

  it("defaults duplicate/invalid counts to zero when errors are absent", async () => {
    mockPrisma.transaction.count.mockResolvedValue(0);
    mockPrisma.import.findFirst.mockResolvedValue({
      id: "imp-2",
      businessId: businessA.id,
      filename: "statement.csv",
      transactionsFound: 5,
      transactionsImported: 5,
      errors: null,
      createdAt: new Date("2026-02-01T00:00:00.000Z"),
    });

    const result = await getOverviewActionItems();
    expect(result.latestImport?.existingDuplicates).toBe(0);
    expect(result.latestImport?.invalidRows).toBe(0);
  });
});
