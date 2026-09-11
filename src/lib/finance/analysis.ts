// ============================================================
// LedgerAI — Trusted Financial Analysis (Ask LedgerAI)
// ------------------------------------------------------------
// Pure, deterministic computations that turn pre-aggregated,
// verified metrics into the pieces the narration layer needs:
// extremes (with deterministic tie-breaking), category shares,
// period deltas, and expense-impact framing. All values come from
// the finance engine — this module only organizes/derives display
// numbers, never fabricates data, and never touches the database.
// ============================================================

import { percentChange, round } from "./engine";

export interface CategoryTotal {
  categoryName: string;
  amount: number;
}

export interface CategoryShare {
  categoryName: string;
  amount: number;
  /** Percent share of the supplied total (0..100). */
  share: number;
}

/** Categories with actual (positive) activity, sorted by amount desc. */
export function activeCategories(totals: CategoryTotal[]): CategoryTotal[] {
  return totals
    .filter((c) => c.amount > 0)
    .sort((a, b) => b.amount - a.amount);
}

/**
 * The single lowest/highest recorded spend among active categories.
 * Ties are resolved deterministically (alphabetical) — never by row order.
 * Returns null when there are no active categories.
 */
export function extremity(
  totals: CategoryTotal[],
  pick: "low" | "high",
): { names: string[]; amount: number } | null {
  const active = activeCategories(totals);
  if (active.length === 0) return null;
  const amount =
    pick === "low"
      ? Math.min(...active.map((c) => c.amount))
      : Math.max(...active.map((c) => c.amount));
  const names = active
    .filter((c) => c.amount === amount)
    .map((c) => c.categoryName)
    .sort();
  return { names, amount };
}

/** Category shares of a total, sorted by amount desc (ties alphabetically). */
export function distribution(
  totals: CategoryTotal[],
  total: number,
): CategoryShare[] {
  const active = activeCategories(totals);
  if (total <= 0) {
    return active.map((c) => ({ categoryName: c.categoryName, amount: c.amount, share: 0 }));
  }
  return active
    .map((c) => ({
      categoryName: c.categoryName,
      amount: c.amount,
      share: round((c.amount / total) * 100, 1),
    }))
    .sort((a, b) => {
      if (b.amount !== a.amount) return b.amount - a.amount;
      return a.categoryName.localeCompare(b.categoryName);
    });
}

/** Top N contributors by spend (never more than the available categories). */
export function topContributors(
  totals: CategoryTotal[],
  limit: number,
): CategoryShare[] {
  const total = totals.reduce((sum, c) => sum + (c.amount > 0 ? c.amount : 0), 0);
  return distribution(totals, total).slice(0, Math.max(0, limit));
}

export interface Delta {
  /** Percent change current vs prior; null when there is no prior baseline. */
  pct: number | null;
  direction: "up" | "down" | "flat" | "none";
}

/** Percent movement between two verified figures (never assumes the math). */
export function comparisonDelta(current: number, prior: number): Delta {
  const pct = percentChange(current, prior);
  if (pct === null) return { pct: null, direction: "none" };
  if (pct > 0) return { pct: round(pct, 1), direction: "up" };
  if (pct < 0) return { pct: round(pct, 1), direction: "down" };
  return { pct: 0, direction: "flat" };
}

export interface ExpenseImpactProfile {
  revenue: number;
  expenses: number;
  netProfit: number;
  top: CategoryShare[];
}

/**
 * The framing the narration uses to explain why profit moved: expense
 * categories ranked by contribution, with their combined share of spend.
 */
export function expenseImpactProfile(
  revenue: number,
  expenses: number,
  netProfit: number,
  totals: CategoryTotal[],
  limit = 3,
): ExpenseImpactProfile {
  return {
    revenue,
    expenses,
    netProfit,
    top: topContributors(totals, limit),
  };
}