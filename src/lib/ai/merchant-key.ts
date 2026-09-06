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
  "MR",
  "MRS",
  "MISS",
  "DR",
  "ENGR",
  "ALHAJI",
  "CHIEF",
]);

/**
 * Tokens that mark an inter-account transfer (money moving between the user's
 * own accounts), never a merchant purchase. A transfer marker seen BEFORE the
 * first candidate key means the whole description is a transfer -> null.
 */
export const TRANSFER_CONTEXT_TOKENS: ReadonlySet<string> = new Set([
  "TRF",
  "TFR",
  "TRANSFER",
  "NIP",
  "FROM",
  "TO",
  "BY",
  "FT",
  "IFT",
  "NEFT",
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
 * 4. A transfer-context marker seen BEFORE the first candidate key means the
 *    description is an inter-account transfer -> null immediately.
 * 5. Return the first surviving token, truncated to 40 chars.
 * 6. Null when nothing survives — the caller must not learn.
 */
export function extractMerchantKey(description: string): string | null {
  const normalized = normalizeText(description).toUpperCase();
  const tokens = normalized.split(/[^A-Z0-9]+/).filter((t) => t !== "");
  for (const token of tokens) {
    if (BANK_TOKENS.has(token)) continue;
    // A transfer marker before the first candidate means it is a transfer.
    if (TRANSFER_CONTEXT_TOKENS.has(token)) return null;
    if (MERCHANT_KEY_STOPWORDS.has(token)) continue;
    if (DIGITS_ONLY.test(token)) continue;
    if (DATE_LIKE.test(token)) continue;
    if (token.length < 4 && !SHORT_BRAND_ALLOWLIST.has(token)) continue;
    return token.slice(0, 40);
  }
  return null;
}