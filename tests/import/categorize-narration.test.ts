import { describe, expect, it } from "vitest";
import { categorizeImportRow } from "@/lib/import/categorize";
import type { NormalizedImportRow } from "@/lib/import/types";
import type { CategoryRuleDto } from "@/types";

function transferRow(description: string): NormalizedImportRow {
  return {
    rowIndex: 0,
    sourceRow: 2,
    date: "2026-11-01",
    rawDate: "01/11/2026",
    description,
    amount: "1000.00",
    type: "transfer",
    reference: null,
    category: null,
    balance: null,
    errors: [],
    warnings: [],
    skipped: false,
    skipReason: null,
  };
}

function expenseRow(description: string): NormalizedImportRow {
  return { ...transferRow(description), type: "expense" };
}

const learnedRentRule: CategoryRuleDto = {
  id: "rule-rent",
  businessId: "biz-a",
  matchType: "merchant",
  pattern: "JOHN",
  categoryId: "rent-id",
  categoryName: "Rent",
  createdAt: "2026-09-01T00:00:00.000Z",
};

const rentOption = { id: "rent-id", name: "Rent", type: "expense" as const };

const learnedOWealthRule: CategoryRuleDto = {
  ...learnedRentRule,
  id: "rule-owealth",
  matchType: "merchant",
  pattern: "OWEALTH",
  categoryId: "savings-id",
  categoryName: "Savings & Investment",
};

const savingsOption = {
  id: "savings-id",
  name: "Savings & Investment",
  type: "expense" as const,
};

describe("categorizeImportRow — transfer precedence", () => {
  it("keeps an unlearned transfer as Transfer, needing review, with no dictionary guess", async () => {
    const suggestion = await categorizeImportRow(
      transferRow("NIP POS CHOWDECK TRF TO JOHN DOE"),
    );
    expect(suggestion.categoryName).toBe("Transfer");
    expect(suggestion.needsReview).toBe(true);
    expect(suggestion.businessRule).toBeUndefined();
  });

  it("applies a learned counterparty rule to the same person on a different bank", async () => {
    const gtbank = await categorizeImportRow(
      transferRow("GTBANK TRF FROM MR JOHN DOE REF 20261119/8871"),
      { businessRules: [learnedRentRule], categoryOptions: [rentOption] },
    );
    const opay = await categorizeImportRow(
      transferRow("OPAY NIP CREDIT FROM JOHN DOE ****0000"),
      { businessRules: [learnedRentRule], categoryOptions: [rentOption] },
    );

    expect(gtbank.categoryName).toBe("Rent");
    expect(opay.categoryName).toBe("Rent");
    expect(gtbank.businessRule?.categoryId).toBe("rent-id");
    expect(opay.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("never lets the dictionary override a file-provided category or learned rule", async () => {
    const fileCategorized = transferRow("CHOWDECK PAYMENT");
    fileCategorized.category = "Banking";

    const fromFile = await categorizeImportRow(fileCategorized);
    expect(fromFile.categoryName).toBe("Transfer");

    const incomeRow = { ...transferRow("CHOWDECK PAYMENT"), type: "income" as const };
    const learnedSalesRule: CategoryRuleDto = {
      ...learnedRentRule,
      id: "rule-sales",
      pattern: "CHOWDECK",
      categoryId: "sales-id",
      categoryName: "Sales",
    };
    const withRule = await categorizeImportRow(incomeRow, {
      businessRules: [learnedSalesRule],
      categoryOptions: [{ id: "sales-id", name: "Sales", type: "income" as const }],
    });
    expect(withRule.categoryName).toBe("Sales");
    expect(withRule.reason).toContain("learned rule");
  });
});

describe("categorizeImportRow — OWealth funding source", () => {
  it("categorises a merchant by the payee instead of the funding source", async () => {
    const suggestion = await categorizeImportRow(
      expenseRow("PASTRIES STORE|MONIE POINT|0000000001 OWealth Withdrawal"),
    );
    expect(suggestion.categoryName).toBe("Food");
    expect(suggestion.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it("categorises Stamp Duty as Banking", async () => {
    const suggestion = await categorizeImportRow(
      expenseRow("Stamp Duty OWealth Withdrawal"),
    );
    expect(suggestion.categoryName).toBe("Banking");
  });

  it("never assigns a bare person payment to Savings & Investment", async () => {
    const suggestion = await categorizeImportRow(
      expenseRow("MAKANJUOLA|MONIE POINT|0000000002 OWealth Withdrawal"),
    );
    expect(suggestion.categoryName).not.toBe("Savings & Investment");
    expect(suggestion.categoryName).toBe("Other");
    expect(suggestion.confidence).toBe(0.5);
    expect(suggestion.needsReview).toBe(true);
  });

  it("keeps plain OWealth savings moves as Savings & Investment", async () => {
    for (const description of [
      "OWealth Deposit",
      "Auto-save to OWealth",
      "OWealth Withdrawal",
      "OWealth Withdrawal to OPay Wallet",
    ]) {
      const suggestion = await categorizeImportRow(expenseRow(description));
      expect(suggestion.categoryName).toBe("Savings & Investment");
    }
  });

  it("does not strip OWealth wording from income rows", async () => {
    const suggestion = await categorizeImportRow({
      ...expenseRow("PASTRIES STORE|MONIE POINT|0000000001 OWealth Withdrawal"),
      type: "income",
    });
    expect(suggestion.categoryName).toBe("Other Income");
  });

  it("does not apply a learned OWealth-only merchant rule to a payee-prefixed row", async () => {
    const suggestion = await categorizeImportRow(
      expenseRow("PASTRIES STORE|MONIE POINT|0000000001 OWealth Withdrawal"),
      {
        businessRules: [learnedOWealthRule],
        categoryOptions: [savingsOption],
      },
    );
    expect(suggestion.categoryName).toBe("Food");
    expect(suggestion.businessRule).toBeUndefined();
  });

  it("does not apply a learned OWealth-only keyword rule to a payee-prefixed row", async () => {
    const keywordRule: CategoryRuleDto = {
      ...learnedOWealthRule,
      id: "rule-owealth-keyword",
      matchType: "keyword",
      pattern: "owealth\\s+withdrawal",
    };
    const suggestion = await categorizeImportRow(
      expenseRow("PASTRIES STORE|MONIE POINT|0000000001 OWealth Withdrawal"),
      {
        businessRules: [keywordRule],
        categoryOptions: [savingsOption],
      },
    );
    expect(suggestion.categoryName).toBe("Food");
    expect(suggestion.businessRule).toBeUndefined();
  });

  it("still applies a learned OWealth-only rule to a bare savings withdrawal", async () => {
    const suggestion = await categorizeImportRow(expenseRow("OWealth Withdrawal"), {
      businessRules: [learnedOWealthRule],
      categoryOptions: [savingsOption],
    });
    expect(suggestion.categoryName).toBe("Savings & Investment");
    expect(suggestion.businessRule?.categoryId).toBe("savings-id");
  });
});
