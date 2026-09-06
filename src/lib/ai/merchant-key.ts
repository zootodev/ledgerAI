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
  "ONLINE",
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
 * 3. Drop pure-digit, date-like, shorter-than-4 and stopword tokens.
 * 4. Return the first surviving token, truncated to 40 chars.
 * 5. Null when nothing survives — the caller must not learn.
 */
export function extractMerchantKey(description: string): string | null {
  const normalized = normalizeText(description).toUpperCase();
  const tokens = normalized.split(/[^A-Z0-9]+/).filter((t) => t !== "");
  for (const token of tokens) {
    if (token.length < 4) continue;
    if (DIGITS_ONLY.test(token)) continue;
    if (DATE_LIKE.test(token)) continue;
    if (MERCHANT_KEY_STOPWORDS.has(token)) continue;
    return token.slice(0, 40);
  }
  return null;
}