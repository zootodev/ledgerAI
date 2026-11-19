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
