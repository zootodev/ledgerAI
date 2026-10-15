import * as React from "react";
import { Landmark } from "lucide-react";

/**
 * Shown on the business-wide surfaces (Overview, Insights). Account
 * filtering is deliberately NOT duplicated here: the single-account scope
 * lives only on Reports and Transactions, where every query is still bounded
 * by the session business. This note keeps that difference explicit instead
 * of leaving users to guess why an account picker is absent.
 */
export function BusinessWideNote() {
  return (
    <p className="flex items-center gap-1.5 text-xs text-muted">
      <Landmark className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      Totals across all accounts. Filter by a single account in Reports or
      Transactions.
    </p>
  );
}
