// ============================================================
// LedgerAI — Merchant key extraction
// ------------------------------------------------------------
// Deterministic extraction of a reusable merchant key from a raw
// transaction description. Used ONLY for learning category rules:
// a wrong generalization is worse than none, so "silence beats a
// toxic rule" — when no trustworthy key can be extracted the helper
// returns null and the caller must NOT learn.
// ============================================================

import { normalizeText } from "@/lib/import/normalize";

/** Tokens that are transaction plumbing, never merchants. */
export const MERCHANT_KEY_STOPWORDS: ReadonlySet<string> = new Set([
  "NIP",
  "POS",
  "TRF",
  "TFR",
  "TRANSFER",
  "USSD",
  "WEB",
  "ATM",
  "REF",
  "PAYMENT",
  "PURCHASE",
  "FROM",
  "TO",
  "VIA",
  "THE",
  "AND",
  "FOR",
  "INC",
  "LTD",
  "LIMITED",
  "PLC",
  "BANK",
  "CARD",
  "DEBIT",
  "CREDIT",
  "MOBILE",
  "AIRTIME",
  "ONLINE",
  "MONEY",
  "CASH",
  "FUND",
  "FUNDS",
  "ACCOUNT",
  "ACCT",
  "INVOICE",
  "INV",
  "ORDER",
  "TRIP",
  "SERVICE",
  "SERVICES",
  "CHARGE",
  "CHARGES",
  "FEE",
  "FEES",
  "COMMISSION",
  "VAT",
  "TAX",
  "STAMP",
  "DUTY",
  "LEVY",
  "BILL",
  "BILLS",
  "SUBSCRIPTION",
  "MONTHLY",
  "ANNUAL",
  "SALARY",
  "WAGES",
  "LOAN",
  "REPAYMENT",
  "INTEREST",
  "REFUND",
  "REVERSAL",
  "CUSTOMER",
  "CLIENT",
  "VENDOR",
  "SUPPLIER",
]);

/**
 * HONORIFIC titles: person-name lead-ins (MR JOHN DOE, DR ADJAYE CLINIC,
 * ALHAJI BAKERY). A title seen before the first candidate merchant token
 * means the description is person-shaped, and the toxic person-name rule
 * (Phase 7B-1 elimination) would re-appear if we continued to the next token.
 * A title therefore nulls the description immediately. This is intentionally
 * conservative: distinguishing "DR ADJAYE CLINIC" (business) from "MR JOHN
 * DOE" (person) is deferred and would require name/business discrimination.
 */
export const HONORIFIC_TITLES: ReadonlySet<string> = new Set([
  "MR",
  "MRS",
  "MISS",
  "DR",
  "ENGR",
  "ALHAJI",
  "CHIEF",
]);

/**
 * HARD transfer markers: tokens that unambiguously denote an inter-account
 * transfer even on their own. A hard marker seen BEFORE the first candidate
 * key means the whole description is a transfer -> null immediately.
 */
export const HARD_TRANSFER_MARKERS: ReadonlySet<string> = new Set([
  "TRF",
  "TFR",
  "TRANSFER",
  "NIP",
  "FT",
  "IFT",
  "NEFT",
]);

/**
 * SOFT transfer markers: common English prepositions that only denote a
 * transfer when they sit IMMEDIATELY next to a hard marker or a bank token
 * ("TRANSFER TO SAVINGS", "UBA TO JOHN", "TRF FROM MRS OLA"). Otherwise
 * they are prepositions inside an ordinary merchant description
 * ("PAYMENT TO NETFLIX") and are skipped as plain stopwords — they never
 * null the description on their own.
 */
export const SOFT_TRANSFER_MARKERS: ReadonlySet<string> = new Set([
  "TO",
  "FROM",
  "BY",
]);

/** Union of both tiers; anything importing the legacy constant still works. */
export const TRANSFER_CONTEXT_TOKENS: ReadonlySet<string> = new Set([
  ...HARD_TRANSFER_MARKERS,
  ...SOFT_TRANSFER_MARKERS,
]);

/**
 * Bank/provider names that are plumbing, never merchants — both short aliases
 * and common concatenated full names. Sorted. A bank token is skipped like a
 * stopword and never returned as a key.
 */
export const BANK_TOKENS: ReadonlySet<string> = new Set([
  "ACCESS",
  "ACCESSBANK",
  "CITIBANK",
  "ECOBANK",
  "FBN",
  "FCMB",
  "FIDELITY",
  "FIRSTBANK",
  "GTB",
  "GTBANK",
  "GTCO",
  "HERITAGE",
  "JAIZ",
  "KEYSTONE",
  "KUDA",
  "MONIEPOINT",
  "OPAY",
  "PALMPAY",
  "POLARIS",
  "PROVIDUS",
  "STANBIC",
  "STANDARDCHARTERED",
  "STERLING",
  "TITAN",
  "UBA",
  "UNIONBANK",
  "UNITY",
  "WEMA",
  "ZENITH",
  "ZENITHBANK",
]);

/** Short brands (shorter than 4 chars) that are genuine merchants. */
export const SHORT_BRAND_ALLOWLIST: ReadonlySet<string> = new Set([
  "MTN",
  "GLO",
  "KFC",
  "DHL",
  "UPS",
  "BUA",
]);

/** DDMMM, MMMDD, MMMYYYY and DDDMMMYYYY date fragments, e.g. 06SEP. */
const DATE_LIKE = /^(?:(?:0?[1-9]|[12]\d|3[01])[A-Z]{3}(?:\d{4})?|[A-Z]{3}(?:0?[1-9]|[12]\d|3[01]))$/;

/** Pure digits: references, amounts, account numbers. */
const DIGITS_ONLY = /^\d+$/;

/**
 * Extract the first trustworthy merchant key.
 *
 * 1. Apply normalizeText(), then uppercase.
 * 2. Split on any run of non-alphanumeric characters, so "UBER *TRIP",
 *    "UBER.COM" and "UBER-EATS" all yield the first token UBER.
 * 3. Drop bank/provider name tokens and stopwords, then pure-digit,
 *    date-like and shorter-than-4 tokens (unless allowlisted).
 * 4. A HARD transfer marker seen BEFORE the first candidate key means the
 *    description is an inter-account transfer -> null immediately.
 * 5. A SOFT marker (TO/FROM/BY) counts as a transfer marker ONLY when it is
 *    immediately adjacent (previous or next token) to a HARD marker or a
 *    bank token; that also nulls the description. Otherwise it is a plain
 *    stopword: skipped, does not null.
 * 6. An HONORIFIC title (MR/MRS/MISS/DR/ENGR/ALHAJI/CHIEF) before the first
 *    candidate means the description is person-shaped -> null. Name vs
 *    business discrimination is deferred, so DR ADJAYE CLINIC is rejected
 *    along with MR JOHN DOE.
 * 7. Return the first surviving token, truncated to 40 chars.
 * 8. Null when nothing survives — the caller must not learn.
 */
export function extractMerchantKey(description: string): string | null {
  const normalized = normalizeText(description).toUpperCase();
  const tokens = normalized.split(/[^A-Z0-9]+/).filter((t) => t !== "");
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (BANK_TOKENS.has(token)) continue;
    // A hard transfer marker before the first candidate means it is a transfer.
    if (HARD_TRANSFER_MARKERS.has(token)) return null;
    if (SOFT_TRANSFER_MARKERS.has(token)) {
      // Only adjacent to a hard marker or a bank token is it plumbing.
      const prev = i > 0 ? tokens[i - 1] : "";
      const next = i + 1 < tokens.length ? tokens[i + 1] : "";
      if (
        HARD_TRANSFER_MARKERS.has(prev) ||
        BANK_TOKENS.has(prev) ||
        HARD_TRANSFER_MARKERS.has(next) ||
        BANK_TOKENS.has(next)
      ) {
        return null;
      }
      continue; // plain preposition inside a merchant description
    }
    // An honorific title before the first candidate means the description is
    // person-shaped (MR JOHN DOE). Continuing would recreate the toxic
    // person-name rule, so the description is rejected as a whole. No name or
    // business discrimination is attempted.
    if (HONORIFIC_TITLES.has(token)) return null;
    if (MERCHANT_KEY_STOPWORDS.has(token)) continue;
    if (DIGITS_ONLY.test(token)) continue;
    if (DATE_LIKE.test(token)) continue;
    if (token.length < 4 && !SHORT_BRAND_ALLOWLIST.has(token)) continue;
    return token.slice(0, 40);
  }
  return null;
}