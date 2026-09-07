import { describe, expect, it } from "vitest";
import {
  extractMerchantKey,
  MERCHANT_KEY_STOPWORDS,
  TRANSFER_CONTEXT_TOKENS,
  HARD_TRANSFER_MARKERS,
  SOFT_TRANSFER_MARKERS,
  BANK_TOKENS,
  SHORT_BRAND_ALLOWLIST,
  HONORIFIC_TITLES,
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

  it("phase 7B-2: a bare soft marker (TO/FROM/BY) is only a transfer when adjacent to a hard marker or a bank token", () => {
    // A plain preposition inside a merchant description is skipped, not null.
    expect(extractMerchantKey("PAYMENT TO NETFLIX")).toBe("NETFLIX");

    // Soft marker immediately adjacent to a HARD marker -> transfer.
    expect(extractMerchantKey("TRANSFER TO SAVINGS")).toBeNull();
    expect(extractMerchantKey("NIP FROM JOHN DOE")).toBeNull();
    expect(extractMerchantKey("GTB TRF TO ADEBAYO")).toBeNull();
    expect(extractMerchantKey("TRF FROM MRS OLA")).toBeNull();

    // Soft marker immediately adjacent to a BANK token -> transfer.
    expect(extractMerchantKey("UBA TO JOHN")).toBeNull();
  });

  it("phase 7B-2: documents the upheld ambiguity (generic lead word wins; brand is unreachable without forced stopwords)", () => {
    // The first-candidate extractor returns the first surviving token. The
    // location/activity lead words ABUJA/DELIVERY/RIDE are NOT merchant-key
    // stopwords (that would be an arbitrary global-word workaround), and
    // location/business/activity recognition is deferred to a later phase.
    // Under those constraints UBER/JUMIA/BOLT are unreachable here: the
    // exact first-candidate ambiguity is pinned below, not the ideal brand.
    expect(extractMerchantKey("TRIP TO ABUJA UBER")).toBe("ABUJA");
    expect(extractMerchantKey("DELIVERY FROM JUMIA")).toBe("DELIVERY");
    expect(extractMerchantKey("RIDE BY BOLT")).toBe("RIDE");
  });

  it("phase 7B-2: records the actual output for a bare-soft lead-in with no surviving merchant", () => {
    // FROM is skipped as a plain stopword; ABC is 3 chars and not on the
    // short-brand allowlist; LTD is a stopword. Nothing survives -> null.
    expect(extractMerchantKey("FROM ABC LTD")).toBeNull();
  });

  it("phase 7B-2: an honorific title before the first candidate nulls the description (person-name rule stays eliminated)", () => {
    // MR JOHN DOE must never re-learn JOHN; DR ADJAYE CLINIC / ALHAJI BAKERY
    // are rejected too — name vs business discrimination is deliberately
    // deferred, so no title leads to a learned key.
    expect(extractMerchantKey("DR ADJAYE CLINIC")).toBeNull();
    expect(extractMerchantKey("MR JOHN DOE")).toBeNull();
    expect(extractMerchantKey("ALHAJI BAKERY")).toBeNull();
  });

  it("exports the split hard/soft transfer marker tiers and their union", () => {
    for (const t of ["TRF", "TFR", "TRANSFER", "NIP", "FT", "IFT", "NEFT"]) {
      expect(HARD_TRANSFER_MARKERS.has(t)).toBe(true);
    }
    for (const t of ["TO", "FROM", "BY"]) {
      expect(SOFT_TRANSFER_MARKERS.has(t)).toBe(true);
    }
    // The legacy union still contains every marker from both tiers.
    for (const t of ["TRF", "TFR", "TRANSFER", "NIP", "FT", "IFT", "NEFT", "TO", "FROM", "BY"]) {
      expect(TRANSFER_CONTEXT_TOKENS.has(t)).toBe(true);
    }
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
      "VENDOR", "SUPPLIER",
    ]) {
      expect(MERCHANT_KEY_STOPWORDS.has(stop)).toBe(true);
    }
  });

  it("exports the honorific title set used to reject person-shaped descriptions", () => {
    for (const title of ["MR", "MRS", "MISS", "DR", "ENGR", "ALHAJI", "CHIEF"]) {
      expect(HONORIFIC_TITLES.has(title)).toBe(true);
      expect(MERCHANT_KEY_STOPWORDS.has(title)).toBe(false);
    }
  });

  it("deliberately does NOT treat location/activity words as global stopwords", () => {
    // The ABUJA/DELIVERY/RIDE workaround is refused: arbitrary generic words
    // are not merchant-key stopwords. They survive as first candidates; the
    // UBER/JUMIA/BOLT recovery is a documented ambiguity awaiting recognition.
    for (const word of ["ABUJA", "DELIVERY", "RIDE"]) {
      expect(MERCHANT_KEY_STOPWORDS.has(word)).toBe(false);
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
