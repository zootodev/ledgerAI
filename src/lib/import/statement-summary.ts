// ============================================================
// LedgerAI — statement header evidence
// ------------------------------------------------------------
// CSV/XLSX exports often print opening/closing balances and totals as ordinary
// rows. This module finds those non-transaction figures so reconciliation can
// compare them with the parsed rows. It never invents a transaction from a
// summary line.
// ============================================================

import type { RawImportRow, StatementHeaderSummary } from "./types";

export function emptyStatementSummary(): StatementHeaderSummary {
  return {
    openingBalance: null,
    closingBalance: null,
    totalDebit: null,
    totalCredit: null,
    debitCount: null,
    creditCount: null,
    transactionCount: null,
    periodFrom: null,
    periodTo: null,
    accountName: null,
    accountNumber: null,
  };
}

function parseLooseMoney(text: string): string | null {
  const match = /[-(]?\s*(?:₦|NGN)?\s*\d[\d,]*(?:\.\d{1,2})?\)?/i.exec(text);
  if (!match) return null;
  const raw = match[0].trim();
  const negative = raw.startsWith("-") || raw.startsWith("(");
  const cleaned = raw
    .replace(/[₦$€£]/g, "")
    .replace(/NGN/gi, "")
    .replace(/[()]/g, "")
    .replace(/[-+]/g, "")
    .replace(/,/g, "")
    .trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return null;
  return `${negative ? "-" : ""}${value.toFixed(2)}`;
}

/** Read header figures from raw rows that are not transaction rows. */
export function summarizeRawRows(rows: RawImportRow[]): StatementHeaderSummary {
  const summary = emptyStatementSummary();
  for (const row of rows) {
    const text = Object.values(row.values)
      .filter((value) => value.trim() !== "")
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (text === "") continue;

    const opening = /opening\s*balance[^0-9()\n]*([-(]?\s*(?:₦|NGN)?\s*\d[\d,]*(?:\.\d{1,2})?\)?)/i.exec(text);
    if (opening && summary.openingBalance === null) {
      summary.openingBalance = parseLooseMoney(opening[1]);
    }
    const closing = /closing\s*balance[^0-9()\n]*([-(]?\s*(?:₦|NGN)?\s*\d[\d,]*(?:\.\d{1,2})?\)?)/i.exec(text);
    if (closing) summary.closingBalance = parseLooseMoney(closing[1]);

    const debit =
      /total\s*(?:debit|debits|withdrawal|withdrawals|money\s*out|outflow|paid\s*out)[^0-9()\n]*([-(]?\s*(?:₦|NGN)?\s*\d[\d,]*(?:\.\d{1,2})?\)?)/i.exec(
        text,
      );
    if (debit && summary.totalDebit === null) summary.totalDebit = parseLooseMoney(debit[1]);
    const credit =
      /total\s*(?:credit|credits|deposit|deposits|money\s*in|inflow|paid\s*in)[^0-9()\n]*([-(]?\s*(?:₦|NGN)?\s*\d[\d,]*(?:\.\d{1,2})?\)?)/i.exec(
        text,
      );
    if (credit && summary.totalCredit === null) summary.totalCredit = parseLooseMoney(credit[1]);

    const count =
      /total\s*(?:transactions?|txns?|count|rows?)[^0-9\n]*(\d+)/i.exec(text) ??
      /(\d+)\s*(?:transactions?|txns?|rows?)\b/i.exec(text);
    if (count && summary.transactionCount === null) {
      summary.transactionCount = Number(count[1]);
    }
    const debitCount = /(\d+)\s*(?:debits?|withdrawals?|money\s*out|outflows?)\b/i.exec(text);
    if (debitCount && summary.debitCount === null) summary.debitCount = Number(debitCount[1]);
    const creditCount = /(\d+)\s*(?:credits?|deposits?|money\s*in|inflows?)\b/i.exec(text);
    if (creditCount && summary.creditCount === null) summary.creditCount = Number(creditCount[1]);

    const accountName = /account\s*name\s*[:#-]\s*(.+)$/i.exec(text);
    if (accountName && summary.accountName === null) {
      summary.accountName = accountName[1].trim().slice(0, 120);
    }
    const accountNumber = /(?:account|acct)\s*(?:number|no|#)?\s*[:#-]?\s*(\d{6,})\b/i.exec(text);
    if (accountNumber && summary.accountNumber === null) {
      summary.accountNumber = accountNumber[1];
    }
  }
  return summary;
}

/** True when at least one header figure/identity is present. */
export function hasStatementSummary(summary: StatementHeaderSummary | null | undefined): boolean {
  if (!summary) return false;
  return Object.values(summary).some((value) => value !== null);
}
