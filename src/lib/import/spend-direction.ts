// ============================================================
// LedgerAI — last-resort spend wording for statements with NO direction cell
// ------------------------------------------------------------
// Debit/Credit columns, signs and balance deltas always win. This helper is
// only used when a statement gives no direction at all, so a positive
// "AIRTIME PURCHASE" or betting STAKE is not silently booked as income.
// Genuine credits (winnings, refunds, salary) are explicitly excluded.
// ============================================================

const CREDIT_WORDS =
  /\b(WIN|WON|WINNINGS?|PAYOUT|PAID\s+OUT|REFUND|REVERSAL|CASHBACK|INTEREST|SALARY|PAYROLL|DISBURSEMENT)\b/i;

const SPEND_WORDS =
  /\b(AIRTIME|RECHARGE|TOP\s*UP|DATA|PLAN|BUNDLE|MINS?|MINUTES|BILLS?|UTILITIES?|STAKE|BET|BETTING|BET9JA|SPORTY\s*BET|1XBET|BETKING|BETWAY|BANGBET)\b/i;

/** True only for unmistakable purchase/stake wording when no side is given. */
export function looksLikeSpendWithoutDirection(description: string): boolean {
  const text = description.trim().replace(/\s+/g, " ");
  if (!text || CREDIT_WORDS.test(text)) return false;
  return SPEND_WORDS.test(text);
}
