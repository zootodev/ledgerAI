// ============================================================
// LedgerAI — Nigerian merchant/keyword dictionary
// ------------------------------------------------------------
// A deterministic, local-only layer between learned rules and the generic
// rules engine. It covers common Nigerian bank-statement wording (POS, NIP,
// airtime, electricity, betting, streaming, ride-hailing) and always explains
// itself. No external API is involved.
// ============================================================

import type { ImportRowType } from "./types";

export interface DictionarySuggestion {
  categoryName: string;
  confidence: number;
  needsReview: boolean;
  reason: string;
}

interface DictionaryRule {
  re: RegExp;
  categoryName: string;
  confidence: number;
  reason: string;
  needsReview?: boolean;
}

const EXPENSE_RULES: DictionaryRule[] = [
  {
    re: /\b(stamp\s*duty|emtl|sms\s*(?:alert|charge|fee)|maintenance\s*fee|account\s*maintenance|commission|bank\s*charge|service\s*charge|vat|levy|charges?)\b/i,
    categoryName: "Banking",
    confidence: 0.9,
    reason: "bank charge keyword",
  },
  {
    re: /\b(mtn|glo|airtel|9mobile|etisalat|airtime|data\s*(?:bundle|plan)|recharge|top\s*up|topup)\b/i,
    categoryName: "Airtime & Data",
    confidence: 0.88,
    reason: "airtime/data keyword",
  },
  {
    re: /\b(dstv|gotv|startimes|showmax|ikedc|ekedc|aedc|bedc|phed|ibedc|electricity|prepaid|postpaid|water\s*bill|spectranet|smile|broadband|internet\s*subscription)\b/i,
    categoryName: "Utilities",
    confidence: 0.87,
    reason: "utility/subscription keyword",
  },
  {
    re: /\b(restaurant|chicken\s*republic|dominos|pizza|burger|eatery|canteen|jollof|suya|bakery|grocery|supermarket|shoprite|spar|market|food)\b/i,
    categoryName: "Food",
    confidence: 0.84,
    reason: "food merchant keyword",
  },
  {
    re: /\b(uber|bolt|ride|taxi|transport|lagbus|brt|nnpc|total\s*energies|mobil|oando|petrol|filling\s*station|parking)\b/i,
    categoryName: "Transportation",
    confidence: 0.85,
    reason: "transport/fuel keyword",
  },
  {
    re: /\b(pos|cash\s*withdrawal|atm\s*withdrawal|agent\s*withdrawal|agent\s*banking)\b/i,
    categoryName: "Cash & POS",
    confidence: 0.82,
    reason: "POS/cash withdrawal keyword",
  },
  {
    re: /\b(bet9ja|sportybet|sporty\s*bet|1xbet|betking|bangbet|betway|casino|lottery)\b/i,
    categoryName: "Betting",
    confidence: 0.9,
    reason: "betting merchant keyword",
  },
  {
    re: /\b(paystack|flutterwave|interswitch|remita|netflix|spotify|google|apple|amazon|meta|facebook|online\s*payment|card\s*payment|web\s*purchase|subscription)\b/i,
    categoryName: "Online Payments",
    confidence: 0.8,
    reason: "online payment keyword",
  },
  {
    re: /\b(transfer\s+to|nip\s+transfer|send\s+money|money\s+transfer|mobile\s+money)\b/i,
    categoryName: "Transfers to People",
    confidence: 0.48,
    needsReview: true,
    reason: "person-to-person transfer wording",
  },
];

const INCOME_RULES: DictionaryRule[] = [
  {
    re: /\b(interest|credit\s*interest|savings\s*interest)\b/i,
    categoryName: "Other Income",
    confidence: 0.9,
    reason: "interest income keyword",
  },
  {
    re: /\b(salary|payroll|wages|stipend|allowance)\b/i,
    categoryName: "Other Income",
    confidence: 0.82,
    reason: "salary/allowance keyword",
  },
  {
    re: /\b(sales?|invoice|payment\s*received|settlement|merchant\s*settlement)\b/i,
    categoryName: "Sales",
    confidence: 0.75,
    reason: "sales/settlement keyword",
  },
  {
    re: /\b(transfer\s+from|nip\s+transfer|incoming\s+transfer|money\s+received)\b/i,
    categoryName: "Other Income",
    confidence: 0.46,
    needsReview: true,
    reason: "incoming person-to-person transfer",
  },
];

const BY_TYPE: Record<Exclude<ImportRowType, "transfer">, DictionaryRule[]> = {
  expense: EXPENSE_RULES,
  income: INCOME_RULES,
};

/**
 * Return the highest-confidence dictionary match for a description/type.
 * Learned business rules are applied by the caller first, so this never
 * overrides a correction the user already made.
 */
export function matchDictionary(
  description: string,
  type: ImportRowType,
): DictionarySuggestion | null {
  if (type === "transfer") return null;
  const text = description.replace(/\s+/g, " ").trim();
  if (text === "") return null;
  const rules = BY_TYPE[type];
  let best: { rule: DictionaryRule; matched: string } | null = null;
  for (const rule of rules) {
    const match = rule.re.exec(text);
    if (!match) continue;
    if (!best || rule.confidence > best.rule.confidence) {
      best = { rule, matched: match[0] };
    }
  }
  if (!best) return null;
  return {
    categoryName: best.rule.categoryName,
    confidence: best.rule.confidence,
    needsReview: best.rule.needsReview ?? false,
    reason: `${best.rule.reason} ("${best.matched.trim()}")`,
  };
}

/** Recognise a person-to-person transfer description without claiming certainty. */
export function looksLikePersonTransfer(description: string): boolean {
  return /\b(transfer\s+to|nip\s+transfer|send\s+money|mobile\s+money|transfer\s+from)\b/i.test(
    description,
  );
}
