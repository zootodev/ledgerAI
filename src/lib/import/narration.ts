// ============================================================
// LedgerAI — Nigerian bank narration normalisation
// ------------------------------------------------------------
// Deterministic, local-only cleanup applied BEFORE category matching.
// Bank PDFs frequently join several cells with "|" and prefix the useful
// counterparty/merchant word with transaction plumbing (NIP, TRF, session
// references, POS terminal ids, card masks, dates, VIA/FROM/TO wrappers).
//
// The goal is deliberately narrow: keep the words that identify the merchant
// or counterparty, drop the plumbing, and never invent information. Short
// generic words ("data", "ride", "market") are NOT deleted here — dictionary
// rules that use them must carry their own word-boundary guards.
// ============================================================

import {
  BANK_TOKENS,
  HARD_TRANSFER_MARKERS,
  HONORIFIC_TITLES,
  MERCHANT_KEY_STOPWORDS,
  SOFT_TRANSFER_MARKERS,
} from "@/lib/ai/merchant-key";

/** Noise tokens that are safe to drop wherever they appear. */
const NOISE_TOKENS: ReadonlySet<string> = new Set([
  ...MERCHANT_KEY_STOPWORDS,
  ...HARD_TRANSFER_MARKERS,
  ...SOFT_TRANSFER_MARKERS,
  ...HONORIFIC_TITLES,
  "NIBSS",
  "SESSION",
  "TERMINAL",
  "TRAN",
  "TXN",
  "TRANSACTION",
  "INITIATED",
  "COMPLETED",
  "SUCCESSFUL",
  "FAILED",
  "REVERSED",
  "OUTWARD",
  "INWARD",
  "CREDITED",
  "DEBITED",
  "SOURCE",
  "DESTINATION",
  "BENEFICIARY",
  "REMARKS",
  "NARRATION",
  "DETAILS",
  "PARTICULARS",
  "MOBILEBANKING",
  "INTERNETBANKING",
  "WEBBANKING",
]);

/**
 * Financial words that the merchant-key stopword list removes on purpose
 * (so it never learns "SALARY" as a merchant). The category normaliser must
 * KEEP them — they are exactly the income/expense signals we want to match.
 */
const SIGNAL_TOKENS: ReadonlySet<string> = new Set([
  "SALARY", "PAYROLL", "WAGES", "STIPEND", "ALLOWANCE", "INTEREST", "REFUND",
  "REVERSAL", "REVERSED", "CASHBACK", "BONUS", "BONUSES", "LOAN", "DISBURSEMENT",
  "REPAYMENT", "FEES", "FEE", "CHARGES", "CHARGE", "COMMISSION", "VAT", "TAX",
  "STAMP", "DUTY", "LEVY", "BILL", "BILLS", "SUBSCRIPTION", "SERVICE", "SERVICES",
  "RENT", "INSURANCE", "SCHOOL", "FEES", "PENALTY", "FINE",
  "AIRTIME", "POS", "ATM", "PURCHASE", "WITHDRAWAL", "CASH", "PAYMENT",
  "RECEIVED", "CUSTOMER", "CLIENT", "DEPOSIT", "TRANSACTION", "TRANSFER",
]);

/** Words that identify a savings/investment product rather than a person. */
const PRODUCT_TOKENS: ReadonlySet<string> = new Set([
  "OWEALTH",
  "SAVINGS",
  "FIXED",
  "DEPOSIT",
  "PIGGYVEST",
  "COWRYWISE",
  "WALLET",
  "AUTOSAVE",
]);

const PIPE = /\s*[|/]\s*/g;
const DATE_LIKE = /\b(?:\d{1,2}[A-Z]{3}|[A-Z]{3}\d{1,2}|\d{4}-\d{2}-\d{2}|\d{2}[/-]\d{2}[/-]\d{2,4})\b/gi;
const REFERENCE_LIKE = /\b(?:[A-Z]{2,}[-/]?\d{3,}|\d{4,}[A-Z]{0,3}|(?=[A-Z0-9]*\d)[A-Z0-9]{8,})\b/g;
const MASKED_ACCOUNT = /\*{2,}\d{2,}/g;
const CARD_MASK = /\b(?:\d[\s-]?){12,19}\b/g;
const UUID_LIKE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

function uppercase(word: string): string {
  return word.toUpperCase();
}

/**
 * Normalize a raw narration for category matching.
 *
 * - strips pipes/slashes used to join PDF cells, dates, card/reference
 *   numbers and masked account fragments;
 * - drops bank names and transaction plumbing tokens;
 * - keeps the first meaningful product/merchant/counterparty wording.
 *
 * The output is uppercase with single spaces. It is safe to feed to both the
 * dictionary and the generic rules engine; the original row description is
 * never mutated.
 */
export function normalizeNarration(description: string): string {
  let text = description.replace(/\s+/g, " ").trim();
  if (text === "") return "";

  text = text
    .replace(PIPE, " ")
    .replace(UUID_LIKE, " ")
    .replace(MASKED_ACCOUNT, " ")
    .replace(CARD_MASK, " ")
    .replace(DATE_LIKE, " ")
    .replace(REFERENCE_LIKE, " ");

  const tokens = text
    .split(/[^A-Za-z0-9]+/)
    .filter((token) => token !== "")
    .map(uppercase);

  const kept: string[] = [];
  for (const token of tokens) {
    if (/^\d+$/.test(token)) continue;
    if (BANK_TOKENS.has(token)) continue;
    if (NOISE_TOKENS.has(token) && !SIGNAL_TOKENS.has(token)) continue;
    if (kept.includes(token)) continue;
    kept.push(token);
  }

  // Collapse "OWealth ... Wallet" style product wording once so dictionary
  // rules see a single stable product token.
  const product = kept.find((token) => PRODUCT_TOKENS.has(token));
  if (product) {
    return kept.filter((token) => !PRODUCT_TOKENS.has(token) || token === product).join(" ");
  }
  return kept.join(" ");
}

/**
 * Stable counterparty key for transfer narrations.
 *
 * Unlike `extractMerchantKey`, transfer markers are EXPECTED here, so they are
 * skipped rather than rejecting the description. Bank names, honorifics,
 * references and account fragments are removed; the first surviving
 * counterparty/product word is uppercased and returned. Returns null when no
 * trustworthy token survives, so no rule is learned from plumbing alone.
 */
export function extractCounterpartyKey(description: string): string | null {
  const tokens = normalizeNarration(description)
    .split(" ")
    .filter((token) => token !== "");
  for (const token of tokens) {
    if (/^\d+$/.test(token)) continue;
    if (HARD_TRANSFER_MARKERS.has(token) || token === "TRANSFER") continue;
    if (NOISE_TOKENS.has(token) && !SIGNAL_TOKENS.has(token)) continue;
    if (BANK_TOKENS.has(token)) continue;
    if (token.length < 3) continue;
    return token.slice(0, 40);
  }
  return null;
}
