import * as React from "react";
import { Landmark } from "lucide-react";

/**
 * Shown on the business-wide surfaces (Overview, Insights). Account
 * filtering is deliberately NOT duplicated here: the single-account scope
 * lives only on Reports and Transactions, where every query is still bounded
 * by the session business. This note keeps that difference explicit instead
 * of leaving users to guess why an account picker is absent.
 *
 * `variant` adapts the wording to the surface: Overview points users at the
 * pages that DO offer an account filter, while Insights — which has no
 * account scope at all — just states that the totals are business-wide.
 */
export function BusinessWideNote({
  variant = "overview",
}: {
  variant?: "overview" | "insights";
}) {
  return (
    <p className="flex items-center gap-1.5 text-xs text-muted">
      <Landmark className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {variant === "insights"
        ? "Totals cover every account; insights are not filtered by account."
        : "Totals across all accounts. Filter by a single account in Reports or Transactions."}
    </p>
  );
}
