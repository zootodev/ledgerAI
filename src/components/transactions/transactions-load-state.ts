/**
 * Coarse state of one asynchronous server-side load on the transactions page.
 * Shape mirrors PromiseSettledResult exactly, so the page can pass its
 * Promise.allSettled outputs straight in.
 */
export type SettledLoad =
  | { status: "fulfilled"; value: unknown }
  | { status: "rejected"; reason: unknown };

export interface TransactionLoadState {
  /** Full failure of the transactions list itself -> replaces the table. */
  loadError: string | null;
  /** Transactions loaded, but the account list failed. */
  accountsError: string | null;
  /** Transactions loaded, but the category list failed. */
  categoriesError: string | null;
}

export const TRANSACTIONS_LOAD_ERROR =
  "We couldn't load your records right now. Please try again.";

/**
 * Decide how the transactions page presents partial failures:
 *  - a failure of the transactions LIST keeps the full error state (retry),
 *    because there is no table to show;
 *  - failures of SUPPORTING data (accounts/categories) never hide a
 *    successfully loaded transactions list — they surface as separate
 *    non-blocking warnings, and the list's own columns fall back to safe
 *    "—" placeholders instead of fabricated labels.
 */
export function summarizeTransactionLoads(
  txs: SettledLoad,
  accounts: SettledLoad,
  categories: SettledLoad,
): TransactionLoadState {
  return {
    loadError: txs.status === "rejected" ? TRANSACTIONS_LOAD_ERROR : null,
    accountsError:
      accounts.status === "rejected" ? "The account list couldn't be loaded." : null,
    categoriesError:
      categories.status === "rejected" ? "The category list couldn't be loaded." : null,
  };
}