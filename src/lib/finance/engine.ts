// ============================================================
// LedgerAI — Deterministic Financial Engine
// ------------------------------------------------------------
// ALL financial math lives here in ordinary application code.
// The AI layer NEVER calculates revenue, expenses, profit, margins,
// percentages, balances, or chart aggregates. Those figures are
// produced by this engine from verified stored data and passed to the
// AI only for explanation/narration.
//
// Internal representation: amounts as integer minor units (kobo), so
// no floating-point drift is possible. Convert at the edges.
// ============================================================

export interface PeriodSummary {
  revenue: number; // major units (₦)
  expenses: number;
  transfers: number;
  netProfit: number;
  profitMargin: number | null; // percent, null when revenue is 0
}

/** Build a period summary from income/expense/transfer subtotals (major units). */
export function summarizePeriod(
  revenue = 0,
  expenses = 0,
  transfers = 0,
): PeriodSummary {
  const netProfit = revenue - expenses;
  const profitMargin =
    revenue === 0 ? null : (netProfit / revenue) * 100;
  return { revenue, expenses, transfers, netProfit, profitMargin };
}

/** Percent change from a previous value to a current value. Null if no prior baseline. */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

/** Round a number to a given number of decimal places without float artifacts. */
export function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/** Human-safe formatting of major-units amounts for display. */
export function formatAmount(value: number, currency = "NGN"): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Convert a decimal-string amount (e.g. "2450.50") to integer minor units.
 * Throws on malformed input rather than silently accepting bad money.
 */
export function toMinorUnits(amount: string): number {
  const normalized = amount.trim().replace(/[₦,\s]/g, "");
  if (!/^-?\d+(\.\d{1,2})?$/.test(normalized)) {
    throw new Error(`Invalid amount: "${amount}"`);
  }
  const [whole, fraction = ""] = normalized.split(".");
  const sign = whole.startsWith("-") ? -1 : 1;
  const major = whole.replace("-", "");
  const minorDigits = fraction.padEnd(2, "0").slice(0, 2);
  return sign * (Number(major) * 100 + Number(minorDigits));
}

/** Convert integer minor units back to a major-units number. */
export function fromMinorUnits(minor: number): number {
  return minor / 100;
}
