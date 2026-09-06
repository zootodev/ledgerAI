import { describe, expect, it } from "vitest";
import { extractMerchantKey, MERCHANT_KEY_STOPWORDS } from "../../src/lib/ai/merchant-key";

describe("extractMerchantKey (deterministic merchant key extraction)", () => {
  it("extracts the first token from UBER description variants", () => {
    expect(extractMerchantKey("UBER *TRIP 12345")).toBe("UBER");
    expect(extractMerchantKey("UBER.COM")).toBe("UBER");
    expect(extractMerchantKey("UBER-EATS")).toBe("UBER");
    expect(extractMerchantKey("UBER BV AMSTERDAM NL")).toBe("UBER");
  });

  it("extracts Nigerian bank/disbursement merchants", () => {
    expect(extractMerchantKey("OPAY TRANSFER")).toBe("OPAY");
    expect(extractMerchantKey("MONIEPOINT TRANSFER 87234872")).toBe("MONIEPOINT");
    expect(extractMerchantKey("GTBANK TRANSFER REF 9988776655")).toBe("GTBANK");
    expect(extractMerchantKey("ZENITH BANK TRANSFER")).toBe("ZENITH");
    expect(extractMerchantKey("AIRTEL RECHARGE 500MB")).toBe("AIRTEL");
    expect(extractMerchantKey("9MOBILE DATA BUNDLE")).toBe("9MOBILE");
    expect(extractMerchantKey("BOLT RIDE TO AIRPORT")).toBe("BOLT");
  });

  it("skips plumbing tokens to reach the real merchant", () => {
    expect(extractMerchantKey("PAYSTACK PAYOUT FOR INVOICE 778899")).toBe("PAYSTACK");
    expect(extractMerchantKey("SALARY CREDIT FROM ABC LTD")).toBe("SALARY");
  });

  it("returns null when only plumbing tokens remain", () => {
    expect(extractMerchantKey("NIP TRF 0012345678")).toBeNull();
    expect(extractMerchantKey("POS PURCHASE 123456")).toBeNull();
    expect(extractMerchantKey("TRANSFER FROM 2233445566")).toBeNull();
  });

  it("returns null for date fragments and digit-only descriptions", () => {
    expect(extractMerchantKey("06SEP 2026 POS")).toBeNull();
    expect(extractMerchantKey("2026")).toBeNull();
  });

  it("drops tokens shorter than 4 characters", () => {
    expect(extractMerchantKey("MTN")).toBeNull();
  });

  it("normalizes whitespace and is case-insensitive", () => {
    expect(extractMerchantKey("  uber   *trip ")).toBe("UBER");
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
      "ONLINE",
    ]) {
      expect(MERCHANT_KEY_STOPWORDS.has(stop)).toBe(true);
    }
  });
});