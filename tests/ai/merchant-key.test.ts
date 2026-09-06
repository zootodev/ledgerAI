import { describe, expect, it } from "vitest";
import {
  extractMerchantKey,
  MERCHANT_KEY_STOPWORDS,
  TRANSFER_CONTEXT_TOKENS,
  BANK_TOKENS,
  SHORT_BRAND_ALLOWLIST,
} from "../../src/lib/ai/merchant-key";

describe("extractMerchantKey (deterministic merchant key extraction)", () => {
  it("extracts the first token from UBER description variants", () => {
    expect(extractMerchantKey("UBER *TRIP 12345")).toBe("UBER");
    expect(extractMerchantKey("UBER.COM")).toBe("UBER");
    expect(extractMerchantKey("UBER-EATS")).toBe("UBER");
    expect(extractMerchantKey("UBER BV AMSTERDAM NL")).toBe("UBER");
  });

  it("keeps extracting UBER/SHOPRITE/TOTALENERGIES after the stopword additions", () => {
    expect(extractMerchantKey("UBER TRIP")).toBe("UBER");
    expect(extractMerchantKey("SHOPRITE GLOBAL NG")).toBe("SHOPRITE");
    expect(extractMerchantKey("TOTALENERGIES FUEL")).toBe("TOTALENERGIES");
  });

  it("extracts real merchants and skips the new plumbing words around them", () => {
    expect(extractMerchantKey("AIRTEL RECHARGE 500MB")).toBe("AIRTEL");
    expect(extractMerchantKey("9MOBILE DATA BUNDLE")).toBe("9MOBILE");
    expect(extractMerchantKey("BOLT RIDE TO AIRPORT")).toBe("BOLT");
    expect(extractMerchantKey("PAYSTACK PAYOUT FOR INVOICE 778899")).toBe("PAYSTACK");
    // Fuels / groceries / ride-hailing / subscriptions are genuine merchants.
    expect(extractMerchantKey("TOTALENERGIES PETROL")).toBe("TOTALENERGIES");
    expect(extractMerchantKey("JUMIA SHOPPING ORDER 9988")).toBe("JUMIA");
    expect(extractMerchantKey("NETFLIX SUBSCRIPTION")).toBe("NETFLIX");
    expect(extractMerchantKey("SPOTIFY PREMIUM")).toBe("SPOTIFY");
  });

  it("skips bank/provider names (including concatenated) and never returns them as keys", () => {
    expect(extractMerchantKey("GTBANK TRANSFER REF 9988776655")).toBeNull();
    expect(extractMerchantKey("ZENITHBANK POS 1234")).toBeNull();
    expect(extractMerchantKey("ACCESSBANK USSD AIRTIME")).toBeNull();
    expect(extractMerchantKey("FCMB CHARGE")).toBeNull();
  });

  it("regression: UBER/SHOPRITE/TOTALENERGIES/MTN/KFC/GLO still extract", () => {
    expect(extractMerchantKey("UBER TRIP")).toBe("UBER");
    expect(extractMerchantKey("SHOPRITE LEKKI")).toBe("SHOPRITE");
    expect(extractMerchantKey("TOTALENERGIES FUEL")).toBe("TOTALENERGIES");
    expect(extractMerchantKey("PAYMENT - MTN MOBILE MONEY")).toBe("MTN");
    expect(extractMerchantKey("KFC VICTORIA ISLAND")).toBe("KFC");
    expect(extractMerchantKey("GLO AIRTIME")).toBe("GLO");
  });

  it("returns null when a transfer context marker appears before any candidate", () => {
    expect(extractMerchantKey("NIP TRF 0012345678")).toBeNull();
    expect(extractMerchantKey("GTB TRF JOHN DOE")).toBeNull();
    expect(extractMerchantKey("NIP/ADEBAYO OLA/INV 12")).toBeNull();
    expect(extractMerchantKey("TRANSFER TO SAVINGS")).toBeNull();
    expect(extractMerchantKey("TRANSFER FROM 2233445566")).toBeNull();
    expect(extractMerchantKey("OPAY TRANSFER")).toBeNull();
    expect(extractMerchantKey("MONIEPOINT TRANSFER 87234872")).toBeNull();
    expect(extractMerchantKey("ZENITH BANK TRANSFER")).toBeNull();
    expect(extractMerchantKey("IFT TO SELF 009988")).toBeNull();
  });

  it("allows short brands from the allowlist", () => {
    expect(extractMerchantKey("PAYMENT - MTN MOBILE MONEY")).toBe("MTN");
    expect(extractMerchantKey("MTN")).toBe("MTN");
    expect(extractMerchantKey("GLO DATA")).toBe("GLO");
    expect(extractMerchantKey("KFC BUCKET MEAL")).toBe("KFC");
    expect(extractMerchantKey("DHL SHIPMENT")).toBe("DHL");
  });

  it("returns null when only plumbing tokens remain", () => {
    expect(extractMerchantKey("POS PURCHASE 123456")).toBeNull();
    expect(extractMerchantKey("SALARY CREDIT FROM ABC LTD")).toBeNull();
    expect(extractMerchantKey("VAT ON INVOICE 4455")).toBeNull();
    expect(extractMerchantKey("STAMP DUTY LEVY")).toBeNull();
    expect(extractMerchantKey("MONTHLY SUBSCRIPTION")).toBeNull();
    expect(extractMerchantKey("LOAN REPAYMENT INTEREST")).toBeNull();
  });

  it("returns null for date fragments and digit-only descriptions", () => {
    expect(extractMerchantKey("06SEP 2026 POS")).toBeNull();
    expect(extractMerchantKey("2026")).toBeNull();
  });

  it("drops short tokens that are not on the allowlist", () => {
    expect(extractMerchantKey("AB1 PAYMENT")).toBeNull();
    expect(extractMerchantKey("PQR")).toBeNull();
  });

  it("normalizes whitespace and is case-insensitive", () => {
    expect(extractMerchantKey("  uber   *trip ")).toBe("UBER");
    expect(extractMerchantKey("  payment - mtn mobile money ")).toBe("MTN");
  });

  it("truncates long merchant keys to 40 characters", () => {
    const long = `${"J".repeat(60)} STORE`;
    expect(extractMerchantKey(long)).toBe("J".repeat(40));
  });

  it("exports a complete stopword list covering the documented tokens", () => {
    for (const stop of [
      "NIP", "POS", "TRF", "TFR", "TRANSFER", "USSD", "WEB", "ATM", "REF",
      "PAYMENT", "PURCHASE", "FROM", "TO", "VIA", "THE", "AND", "FOR", "INC",
      "LTD", "LIMITED", "PLC", "BANK", "CARD", "DEBIT", "CREDIT", "MOBILE",
      "AIRTIME", "ONLINE", "MONEY", "CASH", "FUND", "FUNDS", "ACCOUNT", "ACCT", "INVOICE",
      "INV", "ORDER", "TRIP", "SERVICE", "SERVICES", "CHARGE", "CHARGES", "FEE",
      "FEES", "COMMISSION", "VAT", "TAX", "STAMP", "DUTY", "LEVY", "BILL",
      "BILLS", "SUBSCRIPTION", "MONTHLY", "ANNUAL", "SALARY", "WAGES", "LOAN",
      "REPAYMENT", "INTEREST", "REFUND", "REVERSAL", "CUSTOMER", "CLIENT",
      "VENDOR", "SUPPLIER", "MR", "MRS", "MISS", "DR", "ENGR", "ALHAJI", "CHIEF",
    ]) {
      expect(MERCHANT_KEY_STOPWORDS.has(stop)).toBe(true);
    }
  });

  it("exports the transfer, bank and short-brand token sets", () => {
    for (const t of ["TRF", "TFR", "TRANSFER", "NIP", "FROM", "TO", "BY", "FT", "IFT", "NEFT"]) {
      expect(TRANSFER_CONTEXT_TOKENS.has(t)).toBe(true);
    }
    for (const b of ["GTB", "UBA", "ZENITH", "ACCESS", "OPAY", "PALMPAY", "MONIEPOINT"]) {
      expect(BANK_TOKENS.has(b)).toBe(true);
    }
    for (const s of ["MTN", "GLO", "KFC", "DHL", "UPS", "BUA"]) {
      expect(SHORT_BRAND_ALLOWLIST.has(s)).toBe(true);
    }
  });
});
