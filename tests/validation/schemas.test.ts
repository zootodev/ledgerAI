import { describe, expect, it } from "vitest";
import { transactionInputSchema, transactionListQuerySchema } from "../../src/lib/validation/transaction";
import { accountInputSchema } from "../../src/lib/validation/account";
import { categoryInputSchema } from "../../src/lib/validation/category";
import { businessUpdateSchema } from "../../src/lib/validation/business";
import { zErrorMessage } from "../../src/lib/validation";

const validId = "123e4567-e89b-12d3-a456-426614174000";

describe("transactionInputSchema", () => {
  const base = {
    date: "2026-01-15",
    description: "Customer payment",
    amount: "2500.50",
    type: "income",
  };

  it("accepts a valid income/expense/transfer row", () => {
    for (const type of ["income", "expense", "transfer"]) {
      const parsed = transactionInputSchema.safeParse({ ...base, type });
      expect(parsed.success).toBe(true);
    }
  });

  it("rejects a zero amount", () => {
    expect(transactionInputSchema.safeParse({ ...base, amount: "0" }).success).toBe(false);
    expect(transactionInputSchema.safeParse({ ...base, amount: "0.00" }).success).toBe(false);
  });

  it("rejects malformed amounts (negatives, >2 decimals, non-numeric)", () => {
    expect(transactionInputSchema.safeParse({ ...base, amount: "-100" }).success).toBe(false);
    expect(transactionInputSchema.safeParse({ ...base, amount: "1.234" }).success).toBe(false);
    expect(transactionInputSchema.safeParse({ ...base, amount: "abc" }).success).toBe(false);
  });

  it("rejects invalid dates and descriptions", () => {
    expect(transactionInputSchema.safeParse({ ...base, date: "2026-02-30" }).success).toBe(false);
    expect(transactionInputSchema.safeParse({ ...base, date: "15/01/2026" }).success).toBe(false);
    expect(transactionInputSchema.safeParse({ ...base, description: "" }).success).toBe(false);
  });

  it("rejects unknown types", () => {
    expect(transactionInputSchema.safeParse({ ...base, type: "refund" }).success).toBe(false);
  });

  it("coerces empty reference/notes to null and accepts account/category ids", () => {
    const r = transactionInputSchema.safeParse({
      ...base,
      accountId: validId,
      categoryId: validId,
      reference: "",
      notes: "  ",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.reference).toBeNull();
      expect(r.data.notes).toBeNull();
      expect(r.data.accountId).toBe(validId);
    }
  });
});

describe("transactionListQuerySchema", () => {
  it("applies defaults for page, pageSize, and sort", () => {
    const q = transactionListQuerySchema.parse({});
    expect(q.page).toBe(1);
    expect(q.pageSize).toBe(20);
    expect(q.sortBy).toBe("date");
    expect(q.sortDir).toBe("desc");
  });

  it("coerces numeric query strings", () => {
    const q = transactionListQuerySchema.parse({ page: "3", pageSize: "50" });
    expect(q.page).toBe(3);
    expect(q.pageSize).toBe(50);
  });

  it("clamps pageSize to 100, min to 1", () => {
    expect(transactionListQuerySchema.parse({ pageSize: "500" }).pageSize).toBe(100);
    expect(transactionListQuerySchema.parse({ pageSize: "0" }).pageSize).toBe(1);
  });

  it("rejects unsupported sort keys and types", () => {
    expect(transactionListQuerySchema.safeParse({ sortBy: "id" }).success).toBe(false);
    expect(transactionListQuerySchema.safeParse({ type: "refund" }).success).toBe(false);
  });

  it("accepts filter fields", () => {
    const q = transactionListQuerySchema.parse({
      search: "uber",
      type: "expense",
      accountId: validId,
      categoryId: validId,
      dateFrom: "2026-01-01",
      dateTo: "2026-01-31",
    });
    expect(q.search).toBe("uber");
    expect(q.type).toBe("expense");
  });
});

describe("accountInputSchema", () => {
  it("accepts a valid account and uppercases the currency", () => {
    const r = accountInputSchema.parse({ name: "GTBank Current", currency: "ngn" });
    expect(r.currency).toBe("NGN");
  });

  it("defaults currency to NGN and nulls empty institution", () => {
    const r = accountInputSchema.parse({ name: "Opay", institution: "" });
    expect(r.currency).toBe("NGN");
    expect(r.institution).toBeNull();
  });

  it("rejects a missing name and bad currency", () => {
    expect(accountInputSchema.safeParse({ name: " ", currency: "NGN" }).success).toBe(false);
    expect(accountInputSchema.safeParse({ name: "GTB", currency: "Nai" }).success).toBe(false);
  });
});

describe("categoryInputSchema", () => {
  it("accepts income and expense categories", () => {
    expect(categoryInputSchema.safeParse({ name: "Sales", type: "income" }).success).toBe(true);
    expect(categoryInputSchema.safeParse({ name: "Rent", type: "expense" }).success).toBe(true);
  });

  it("rejects missing type and transfer type", () => {
    expect(categoryInputSchema.safeParse({ name: "X" }).success).toBe(false);
    expect(categoryInputSchema.safeParse({ name: "X", type: "transfer" }).success).toBe(false);
  });
});

describe("businessUpdateSchema", () => {
  it("accepts a minimal name-only update with defaults", () => {
    const r = businessUpdateSchema.parse({ name: "Zooto Fashion" });
    expect(r.country).toBe("NG");
    expect(r.currency).toBe("NGN");
  });

  it("rejects an empty name", () => {
    expect(businessUpdateSchema.safeParse({ name: "" }).success).toBe(false);
  });
});

describe("zErrorMessage", () => {
  it("returns a readable first-issue message", () => {
    const r = transactionInputSchema.safeParse({ date: "2026-01-15", description: "", amount: "1", type: "income" });
    if (!r.success) {
      expect(zErrorMessage(r.error)).toContain("Description");
      expect(zErrorMessage(r.error)).toContain("description");
    }
  });
});