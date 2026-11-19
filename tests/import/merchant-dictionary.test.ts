import { describe, expect, it } from "vitest";
import { matchDictionary } from "@/lib/import/merchant-dictionary";

describe("merchant dictionary — Nigerian income rules", () => {
  it("categorises salary/payroll wording", () => {
    const result = matchDictionary("NIP SALARY PAYMENT 0123456789", "income");
    expect(result?.categoryName).toBe("Salary");
    expect(result?.confidence).toBeGreaterThanOrEqual(0.9);
    expect(result?.reason).toContain("salary/payroll keyword");
  });

  it("categorises OWealth, savings and fixed-deposit interest", () => {
    for (const description of [
      "OWealth Interest credited",
      "Savings interest",
      "FIXED DEPOSIT INTEREST 06NOV2026",
    ]) {
      const result = matchDictionary(description, "income");
      expect(result?.categoryName).toBe("Interest");
      expect(result?.reason).toContain("interest income keyword");
    }
  });

  it("categorises refunds and reversals", () => {
    for (const description of ["REFUND FROM MERCHANT", "REVERSAL NIBSS TRF"]) {
      expect(matchDictionary(description, "income")?.categoryName).toBe("Refunds");
    }
  });

  it("categorises cashback, bonuses and rewards", () => {
    for (const description of ["Cashback reward", "BONUS CREDIT", "REWARD OPAY"]) {
      expect(matchDictionary(description, "income")?.categoryName).toBe("Cashback");
    }
  });

  it("categorises loan disbursements", () => {
    const result = matchDictionary("LOAN DISBURSEMENT", "income");
    expect(result?.categoryName).toBe("Loan Disbursement");
    expect(result?.reason).toContain("loan disbursement keyword");
  });

  it("categorises customer payments as Sales", () => {
    expect(matchDictionary("INCOMING PAYMENT", "income")?.categoryName).toBe("Sales");
    expect(matchDictionary("DEPOSIT FROM CUSTOMER", "income")?.categoryName).toBe("Sales");
  });
});

describe("merchant dictionary — Nigerian expense rules", () => {
  it("categorises supermarkets and food delivery", () => {
    for (const description of ["SHOPRITE SUPERMARKET", "CHOWDECK ORDER", "GLOVO 09/11/2026"]) {
      expect(matchDictionary(description, "expense")?.categoryName).toBe("Food");
    }
  });

  it("categorises fuel and ride-hailing", () => {
    expect(matchDictionary("TOTAL ENERGIES FUEL", "expense")?.categoryName).toBe(
      "Transportation",
    );
    expect(matchDictionary("UBER TRIP", "expense")?.categoryName).toBe("Transportation");
  });

  it("categorises airtime and data bundles", () => {
    expect(matchDictionary("MTN DATA BUNDLE", "expense")?.categoryName).toBe("Airtime & Data");
  });

  it("categorises electricity, cable and internet", () => {
    for (const description of ["IKEDC PREPAID", "DSTV SUBSCRIPTION", "SPECTRANET INTERNET SUBSCRIPTION"]) {
      expect(matchDictionary(description, "expense")?.categoryName).toBe("Utilities");
    }
  });

  it("categorises online stores", () => {
    expect(matchDictionary("JUMIA ONLINE STORE", "expense")?.categoryName).toBe("Shopping");
  });

  it("categorises school fees, rent and insurance", () => {
    expect(matchDictionary("SCHOOL FEES", "expense")?.categoryName).toBe("Education");
    expect(matchDictionary("SHOP RENT", "expense")?.categoryName).toBe("Rent");
    expect(matchDictionary("INSURANCE PREMIUM", "expense")?.categoryName).toBe("Insurance");
  });

  it("categorises loan repayments and withdrawals", () => {
    expect(matchDictionary("LOAN REPAYMENT", "expense")?.categoryName).toBe("Banking");
    expect(matchDictionary("FULL WITHDRAWAL", "expense")?.categoryName).toBe("Cash & POS");
    expect(matchDictionary("POS WITHDRAWAL", "expense")?.categoryName).toBe("Cash & POS");
  });

  it("categorises savings/investment apps when not a transfer row", () => {
    for (const description of [
      "PIGGYVEST AUTO SAVE",
      "COWRYWISE INVESTMENT",
      "Transfer to OWealth savings",
    ]) {
      expect(matchDictionary(description, "expense")?.categoryName).toBe("Savings & Investment");
    }
  });
});

describe("merchant dictionary — false-positive guards and precedence", () => {
  it("does not match short words inside other words or names", () => {
    expect(matchDictionary("METADATA", "expense")).toBeNull();
    expect(matchDictionary("BRIDGE", "expense")).toBeNull();
    expect(matchDictionary("MARKETING", "expense")).toBeNull();
    expect(matchDictionary("DATARIDE", "expense")).toBeNull();
  });

  it("never produces a dictionary suggestion for a transfer row", () => {
    expect(matchDictionary("CHOWDECK NIP TRANSFER", "transfer")).toBeNull();
    expect(matchDictionary("SALARY", "transfer")).toBeNull();
  });

  it("keeps person-to-person transfer wording weak and flagged", () => {
    const result = matchDictionary("TRANSFER TO JOHN DOE", "expense");
    expect(result?.categoryName).toBe("Transfers to People");
    expect(result?.confidence).toBeLessThan(0.7);
    expect(result?.needsReview).toBe(true);
  });
});
