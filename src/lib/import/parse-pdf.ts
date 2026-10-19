// ============================================================
// LedgerAI — PDF statement import
// ------------------------------------------------------------
// PDF parsing runs SERVER-SIDE ONLY (pdf-parse is a Node library and
// never ships to the browser — see parsePdfImportAction). The text ->
// row conversion below is kept as pure string functions so the layout
// heuristics are unit-testable without a real PDF file.
//
// Strategy: split the extracted text into lines and look for the
// (date + amount) shape a statement row always has. Each hit is emitted
// as a synthetic Date/Description/Debit/Credit row, so PDFs flow through
// the exact same mapping, normalization and validation pipeline as CSV.
// When a PDF renders every table cell as its own fragment (no line holds a
// full row), credit/debit statements fall back to a flat scan that anchors
// rows on the transaction date and slices text up to the next date.
//
// Bank fingerprints: a recognized letterhead (Kuda, OPay, Moniepoint,
// GTBank, Access) seeds the column order first, because header wording can
// mislead the keyword heuristics (a legend mentioning both "Debit" and
// "Credit", columns spelled "Amount Cr"/"Bal"). No fingerprint, or a guess
// that extracts nothing, falls back to the heuristics below.
//
// Layout modes:
//  - debit-credit: a header line carrying a debit/credit (or withdrawal/
//    deposit, paid out/paid in) pair, so the first amount of a row is the
//    debit side and the second the credit side;
//  - credit-debit: a header carrying a money-in/money-out pair (Moniepoint
//    PDFs) — money goes in first, the trailing amount is the running balance,
//    and the outward/inward category word picks the side;
//  - single-amount: one amount column — sign, accounting parentheses and
//    Dr/Cr markers choose the side (positive defaults to credit/income,
//    matching normalize.ts's single-amount convention).
//
// Known limitations (documented in the UI error text): amounts must have
// decimals, thousands grouping or a currency symbol, and scanned/image
// PDFs without a text layer are not supported.
// ============================================================

import type { RawImportRow } from "./types";

/** Synthetic header row — matches the aliases in mapping.ts exactly. */
export const PDF_IMPORT_HEADERS = ["Date", "Description", "Debit", "Credit"] as const;

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

/** Layout modes for a statement's amount columns. */
type LayoutKind = "debit-credit" | "credit-debit" | "single";

/** Pairs marking a debit-column-then-credit-column statement (bank-standard). */
const DEBIT_CREDIT_PAIRS: [string, string][] = [
  ["debit", "credit"],
  ["withdrawal", "deposit"],
  ["paid out", "paid in"],
];

/** Pairs marking a credit-column-then-debit-column statement (e.g. Moniepoint
 * "Money In | Money Out" PDFs — in before out). */
const CREDIT_DEBIT_PAIRS: [string, string][] = [
  ["money out", "money in"],
];

interface DateMatch {
  iso: string;
  start: number;
  end: number;
}

interface AmountToken {
  start: number;
  end: number;
  /** Absolute value with grouping intact: "1,250.00" or "1250.00". */
  value: string;
  negative: boolean;
}

// All patterns are tried and the earliest match in the line wins, so a
// date never gets shadowed by a later balance that also looks numeric.
const DATE_PATTERNS: RegExp[] = [
  // 2026-01-05, 2026/01/05, 2026.01.05
  /\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/,
  // 05/01/2026, 05-01-2026, 05.01.2026 (day-first, as in normalize.ts)
  /\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})\b/,
  // 05/01/26 — Moniepoint-style two-digit years, read as 20yy
  /\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2})\b/,
  // 05 Jan 2026, 05-Jan-2026, 05/Jan/2026, 5 January 2026
  /\b(\d{1,2})\s*[-/.]?\s*([A-Za-z]{3,9})\.?,?\s*[-/.]?\s*(\d{4})\b/,
  // Jan 05 2026, Jan-05-2026, Jan 5, 2026, January 5, 2026
  /\b([A-Za-z]{3,9})\.?,?\s*[-/.]?\s*(\d{1,2}),?\s*[-/.]?\s*(\d{4})\b/,
];

/**
 * Amount tokens require decimals, thousands grouping or a currency
 * symbol — bare integers (years, page numbers, reference digits) are
 * ignored so descriptions containing digits don't produce phantom rows.
 */
const AMOUNT_PATTERN =
  /[-(]?(?:₦|\$|£|€|\bNGN)?\s*\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?\)?|[-(]?\d+\.\d{1,2}\)?/g;

function isoFrom(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (year < 1900 || year > 2200) return null;
  if (month < 1 || month > 12) return null;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day < 1 || day > daysInMonth) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${year}-${pad(month)}-${pad(day)}`;
}

function findDate(line: string): DateMatch | null {
  let best: DateMatch | null = null;
  for (let p = 0; p < DATE_PATTERNS.length; p++) {
    const m = DATE_PATTERNS[p].exec(line);
    if (!m) continue;
    let iso: string | null = null;
    if (p === 0) {
      iso = isoFrom(Number(m[1]), Number(m[2]), Number(m[3]));
    } else if (p === 1) {
      iso = isoFrom(Number(m[3]), Number(m[2]), Number(m[1]));
    } else if (p === 2) {
      iso = isoFrom(2000 + Number(m[3]), Number(m[2]), Number(m[1]));
    } else if (p === 3) {
      const month = MONTHS[m[2].toLowerCase()];
      if (month) iso = isoFrom(Number(m[3]), month, Number(m[1]));
    } else {
      const month = MONTHS[m[1].toLowerCase()];
      if (month) iso = isoFrom(Number(m[3]), month, Number(m[2]));
    }
    if (!iso) continue;
    if (!best || m.index < best.start) {
      best = { iso, start: m.index, end: m.index + m[0].length };
    }
  }
  return best;
}

function cleanAmount(raw: string): { value: string; negative: boolean } {
  const negative = raw.includes("(") || raw.trimStart().startsWith("-");
  const value = raw
    .replace(/[₦$€£]/g, "")
    .replace(/NGN/gi, "")
    .replace(/[()]/g, "")
    .replace(/[-+]/g, "")
    .replace(/\s+/g, "");
  return { value, negative };
}

function findAmounts(line: string, from: number): AmountToken[] {
  const segment = line.slice(from);
  const tokens: AmountToken[] = [];
  for (const m of segment.matchAll(AMOUNT_PATTERN)) {
    const raw = m[0];
    if (raw.trim() === "") continue;
    const { value, negative } = cleanAmount(raw);
    if (value === "" || !/\d/.test(value)) continue;
    tokens.push({
      start: from + m.index,
      end: from + m.index + raw.length,
      value,
      negative,
    });
  }
  return tokens;
}

/** Detect the statement's column order from a header line carrying both
 * keywords of a debit/credit or credit/debit pair. */
function detectLayout(lines: string[]): LayoutKind {
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (CREDIT_DEBIT_PAIRS.some(([a, b]) => lower.includes(a) && lower.includes(b))) {
      return "credit-debit";
    }
  }
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (DEBIT_CREDIT_PAIRS.some(([a, b]) => lower.includes(a) && lower.includes(b))) {
      return "debit-credit";
    }
  }
  return "single";
}

/** True when a header-ish line names both a balance and a transaction column,
 * i.e. the statement carries a running balance. Real-world debit-credit PDFs
 * omit the empty cell of a row, so a row's amounts are [transaction, balance]
 * rather than [debit, credit] — that balance must not be read as a column. */
function detectBalanceColumn(lines: string[]): boolean {
  return lines.slice(0, 80).some((line) => {
    const lower = line.toLowerCase();
    return (
      /\bbalance\b/.test(lower) &&
      /(debit|credit|amount|withdraw|deposit|money in|money out|paid in|paid out)/.test(
        lower,
      )
    );
  });
}

// ------------------------------------------------------------
// Bank fingerprints
// ------------------------------------------------------------
// Letterhead detection: the bank's name in the header tells us the column
// order before any keyword heuristics run, which matters when the header's
// wording would mislead them (a legend line mentioning both "Debit" and
// "Credit", or column labels spelled "Amount Cr"/"Bal"). When no bank is
// recognised — or the fingerprint's layout yields no rows — the existing
// heuristics decide as before.

/** Banks we can fingerprint from statement letterhead text. */
export type BankFingerprint = "kuda" | "opay" | "moniepoint" | "gtbank" | "access";

/** Per-bank column order: the layout its statements print, and whether a
 * running-balance column is always present (even when the header wording
 * wouldn't let detectBalanceColumn infer it). */
interface BankLayout {
  layout: LayoutKind;
  hasBalance: boolean;
}

const BANK_PATTERNS: [BankFingerprint, RegExp][] = [
  ["moniepoint", /\bmoniepoint\b/i],
  ["gtbank", /\b(?:gtbank|guaranty trust bank)\b/i],
  ["access", /\baccess bank\b/i],
  ["opay", /\bopay\b/i],
  ["kuda", /\bkuda\b/i],
];

const BANK_LAYOUTS: Record<BankFingerprint, BankLayout> = {
  // Money In / Money Out columns, money-in first, trailing running balance.
  moniepoint: { layout: "credit-debit", hasBalance: false },
  // Debit / Credit / Balance; a single populated amount cell per row.
  gtbank: { layout: "debit-credit", hasBalance: true },
  access: { layout: "debit-credit", hasBalance: true },
  // One amount column with a per-row Debit/Credit type word.
  opay: { layout: "single", hasBalance: false },
  kuda: { layout: "single", hasBalance: false },
};

/**
 * Detect which bank produced a statement from its letterhead. Scans the
 * lines BEFORE the first transaction row (the letterhead always precedes the
 * table, while a row's narration may name any bank — "TRF TO ACCESS BANK"
 * inside a Kuda statement must not fingerprint it as Access), capped at 60
 * lines.
 */
export function detectBankFingerprint(text: string): BankFingerprint | null {
  const lines = text.split(/\r?\n|\f/);
  const header: string[] = [];
  for (const line of lines) {
    if (header.length >= 60) break;
    const date = findDate(line);
    if (date && findAmounts(line, date.end).length > 0) break;
    header.push(line);
  }
  const headerText = header.join("\n");
  for (const [bank, pattern] of BANK_PATTERNS) {
    if (pattern.test(headerText)) return bank;
  }
  return null;
}

/** Trim a row's leading-narrative fragment of surrounding separators. */
function cleanNarrative(text: string): string {
  return text
    .trim()
    .replace(/^[\s|:;]+/, "")
    .replace(/[\s|:;]+$/, "");
}

/** Drop a leading value-date that sits before the narrative (day-first
 * statements print both the transaction and the value date in one row). */
function stripLeadingDate(text: string): string {
  const trimmed = text.trim();
  const date = findDate(trimmed);
  if (date && date.start === 0) {
    return trimmed
      .slice(date.end)
      .replace(/^[\s|:;.,-]+/, "")
      .trim();
  }
  return trimmed;
}

/** Numeric value of an amount token, restoring its sign. */
function tokenToNumber(token: AmountToken): number {
  const n = Number(token.value.replace(/,/g, ""));
  return token.negative ? -n : n;
}

/** The statement's opening balance, used to seed running-balance
 * reconciliation for rows that show only one transaction amount. */
function findOpeningBalance(text: string): number | null {
  const m = /opening balance[^0-9-]{0,20}(-?[\d,]+(?:\.\d{1,2})?)/i.exec(text);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Words marking a money-out (debit) row on Moniepoint-style statements. */
const MONEY_OUT_WORDS =
  /(?:\boutward\b|withdraw|\bmoney out\b|paid out|charge|\bfee\b)/i;

/** Words marking a money-in (credit) row on Moniepoint-style statements. */
const MONEY_IN_WORDS =
  /(?:\binward\b|deposit|\bmoney in\b|received|\bsalary\b|\bincome\b)/i;

/** Emit the row in a "credit-then-debit" (money-in | money-out) layout, e.g.
 * Moniepoint PDFs. Columns collapse into the text — each row usually has one
 * transaction amount plus the running balance, and the category word
 * ("outward transfer" / "inward transfer") picks the side. The final amount is
 * always the running balance and is excluded. */
function extractCreditDebitRow(
  line: string,
  sourceRow: number,
  date: DateMatch,
): RawImportRow | null {
  const amounts = findAmounts(line, date.end);
  if (amounts.length === 0) return null;
  const balance = amounts[amounts.length - 1];
  const trans = amounts.slice(0, -1);
  if (trans.length === 0) return null;

  const lastTrans = trans[trans.length - 1];
  const narrative = line.slice(lastTrans.end, balance.start);
  const description = narrative
    .trim()
    .replace(/^[\s|:;]+/, "")
    .replace(/[\s|:;]+$/, "");
  if (description === "") return null;

  const sideText = line.slice(date.end, balance.start);
  let debit = "";
  let credit = "";
  if (trans.length >= 2) {
    // Both columns filled: money in first, money out second.
    credit = trans[0].value;
    debit = lastTrans.value;
  } else if (MONEY_OUT_WORDS.test(sideText)) {
    debit = lastTrans.value;
  } else if (MONEY_IN_WORDS.test(sideText)) {
    credit = lastTrans.value;
  } else {
    credit = lastTrans.value;
  }

  return {
    sourceRow,
    values: {
      Date: date.iso,
      Description: description,
      Debit: debit,
      Credit: credit,
    },
  };
}

/** Strip everything that is an amount token out of a row segment, collapsing
 * the remaining fragments into a readable description. */
function cleanRowNarrative(segment: string, amounts: AmountToken[]): string {
  let description = "";
  let cursor = 0;
  for (const a of amounts) {
    description += segment.slice(cursor, a.start);
    cursor = a.end;
  }
  description += segment.slice(cursor);
  return description
    .split(/\s+/)
    .join(" ")
    .trim()
    .replace(/^\d{1,2}:\d{2}:\d{2}\s*/, "")
    .replace(/^[\s|:;]+/, "")
    .replace(/[\s|:;]+$/, "")
    .trim();
}

/** Reconstruct rows from a Moniepoint-style PDF whose text layer encodes every
 * cell as its own line fragment (column positions appear in reading order, but
 * no single physical line holds a full row). Rows are anchored on the
 * dd/mm/yy date; each row owns the text up to the next date, the last amount
 * in that span is the running balance, and the outward/inward category word
 * picks the debit/credit side. */
function extractCreditDebitTextRows(text: string): RawImportRow[] {
  const lower = text.toLowerCase();
  const moneyInIdx = lower.indexOf("money in");
  const moneyOutIdx = lower.indexOf("money out");
  if (moneyInIdx === -1 || moneyOutIdx === -1) return [];
  const headerEnd = Math.max(moneyInIdx, moneyOutIdx) + "money out".length;
  const headerStart = text.lastIndexOf("\n", Math.min(moneyInIdx, moneyOutIdx)) + 1;
  const headerSlice = lower.slice(headerStart, headerEnd + 80);
  if (!headerSlice.includes("date") && !headerSlice.includes("balance")) return [];
  const rawRegion = text.slice(headerEnd);
  // Statements close with totals / a closing balance after the last
  // transaction; cut them off so they can't bleed into the final row.
  const endMarker = rawRegion.search(
    /closing balance|total money in|total money out|opening balance/i,
  );
  const region = endMarker === -1 ? rawRegion : rawRegion.slice(0, endMarker);

  // dd/mm/yy only — the statement's period line ("Date 08/01/2026 - 08/10/2026")
  // uses four-digit years and must not be anchored as a row.
  const pattern = /\b(\d{1,2})\/(\d{1,2})\/(\d{2})\b/g;
  const hits: RegExpExecArray[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(region)) !== null) hits.push(match);

  const rows: RawImportRow[] = [];
  for (let i = 0; i < hits.length; i++) {
    const hit = hits[i];
    const segmentEnd = i + 1 < hits.length ? hits[i + 1].index : region.length;
    const segment = region.slice(hit.index + hit[0].length, segmentEnd);
    const iso = isoFrom(2000 + Number(hit[3]), Number(hit[2]), Number(hit[1]));
    if (!iso) continue;
    const amounts = findAmounts(segment, 0);
    if (amounts.length === 0) continue;
    // The last amount in the span is the running balance; drop it.
    const trans = amounts.slice(0, -1);
    if (trans.length === 0) continue;
    const lastTrans = trans[trans.length - 1];

    const keywordText = region.slice(hit.index, Math.min(hit.index + 260, segmentEnd));
    let debit = "";
    let credit = "";
    if (trans.length >= 2) {
      // Both columns filled: money in first, money out second.
      credit = trans[0].value;
      debit = lastTrans.value;
    } else if (MONEY_OUT_WORDS.test(keywordText)) {
      debit = lastTrans.value;
    } else if (MONEY_IN_WORDS.test(keywordText)) {
      credit = lastTrans.value;
    } else {
      credit = lastTrans.value;
    }

    rows.push({
      sourceRow: i + 1,
      values: {
        Date: iso,
        Description: cleanRowNarrative(segment, amounts),
        Debit: debit,
        Credit: credit,
      },
    });
  }
  return rows;
}

/** Positional debit-then-credit extraction for statements that render both
 * amount columns explicitly (including `0.00` placeholders) and carry no
 * running balance to reconcile against. */
function extractDebitCreditPositional(
  line: string,
  sourceRow: number,
): RawImportRow | null {
  const date = findDate(line);
  if (!date) return null;
  const amounts = findAmounts(line, date.end);
  if (amounts.length === 0) return null;

  const first = amounts[0];
  const description = stripLeadingDate(cleanNarrative(line.slice(date.end, first.start)));
  let debit = "";
  let credit = "";
  if (amounts.length >= 2) {
    // Column position is authoritative: emit absolute values so normalize.ts
    // never flags "debit value must be positive".
    debit = amounts[0].value;
    credit = amounts[1].value;
  } else if (first.negative) {
    debit = first.value;
  } else {
    credit = first.value;
  }
  return {
    sourceRow,
    values: { Date: date.iso, Description: description, Debit: debit, Credit: credit },
  };
}

interface DebitCreditDraft {
  sourceRow: number;
  iso: string;
  description: string;
  debit: string;
  credit: string;
  /** Both columns were present as amounts, so no reconciliation is needed. */
  explicit: boolean;
  txnValue: string;
  txnNumber: number;
  balance: number | null;
  negative: boolean;
  line: string;
}

function parseDebitCreditDrafts(
  lines: string[],
  hasBalance: boolean,
): DebitCreditDraft[] {
  const drafts: DebitCreditDraft[] = [];
  lines.forEach((line, index) => {
    const date = findDate(line);
    if (!date) return;
    const amounts = findAmounts(line, date.end);
    if (amounts.length === 0) return;

    // With a running-balance column the trailing amount is the balance, not a
    // second transaction amount. Without one, every amount is a transaction.
    const balanceToken =
      hasBalance && amounts.length >= 2 ? amounts[amounts.length - 1] : null;
    const txnAmounts = balanceToken ? amounts.slice(0, -1) : amounts;
    if (txnAmounts.length === 0) return;

    const first = txnAmounts[0];
    drafts.push({
      sourceRow: index + 1,
      iso: date.iso,
      description: stripLeadingDate(cleanNarrative(line.slice(date.end, first.start))),
      debit: txnAmounts.length >= 2 ? txnAmounts[0].value : "",
      credit: txnAmounts.length >= 2 ? txnAmounts[1].value : "",
      explicit: txnAmounts.length >= 2,
      txnValue: first.value,
      txnNumber: tokenToNumber(first),
      balance: balanceToken ? tokenToNumber(balanceToken) : null,
      negative: first.negative,
      line,
    });
  });
  return drafts;
}

/** Decide a single-amount row's side. Running-balance reconciliation wins: the
 * change between consecutive balances equals +/- the transaction amount, which
 * reliably separates debits from credits even when the amount's column is
 * blank. Falls back to a sign or a debit/credit word when balances can't. */
function resolveDebitCreditSide(
  draft: DebitCreditDraft,
  previousBalance: number | null,
): void {
  const { txnValue, txnNumber, balance, negative, line } = draft;
  if (balance !== null && previousBalance !== null) {
    const delta = balance - previousBalance;
    if (Math.abs(delta - txnNumber) < 0.01) {
      draft.credit = txnValue;
      return;
    }
    if (Math.abs(delta + txnNumber) < 0.01) {
      draft.debit = txnValue;
      return;
    }
  }
  const lower = line.toLowerCase();
  if (negative || /\b(dr|debit|withdrawal|money out|paid out)\b/.test(lower)) {
    draft.debit = txnValue;
  } else {
    draft.credit = txnValue;
  }
}

function extractDebitCreditRows(
  lines: string[],
  hasBalance: boolean,
  text: string,
): RawImportRow[] {
  if (!hasBalance) {
    const rows: RawImportRow[] = [];
    lines.forEach((line, index) => {
      const row = extractDebitCreditPositional(line, index + 1);
      if (row) rows.push(row);
    });
    return rows;
  }

  const drafts = parseDebitCreditDrafts(lines, true);
  let previousBalance = findOpeningBalance(text);
  const rows: RawImportRow[] = [];
  for (const draft of drafts) {
    if (!draft.explicit) resolveDebitCreditSide(draft, previousBalance);
    if (draft.balance !== null) previousBalance = draft.balance;
    rows.push({
      sourceRow: draft.sourceRow,
      values: {
        Date: draft.iso,
        Description: draft.description,
        Debit: draft.debit,
        Credit: draft.credit,
      },
    });
  }
  return rows;
}

function extractRow(
  line: string,
  sourceRow: number,
  layout: LayoutKind,
): RawImportRow | null {
  const date = findDate(line);
  if (!date) return null;

  if (layout === "credit-debit") {
    return extractCreditDebitRow(line, sourceRow, date);
  }

  const amounts = findAmounts(line, date.end);
  if (amounts.length === 0) return null;

  const first = amounts[0];
  const lower = line.toLowerCase();
  // Single-amount mode: the first amount is the transaction and any later
  // amount is a running balance (ignored). The side comes from a sign, a Dr/Cr
  // marker, or a debit/credit word anywhere in the row (statements that carry
  // the side in a "Transaction Type" column).
  const description = stripLeadingDate(cleanNarrative(line.slice(date.end, first.start)));
  let debit = "";
  let credit = "";
  if (first.negative || /\b(dr|debit|withdrawal|money out|paid out)\b/.test(lower)) {
    debit = first.value;
  } else {
    credit = first.value;
  }

  return {
    sourceRow,
    values: {
      Date: date.iso,
      Description: description,
      Debit: debit,
      Credit: credit,
    },
  };
}

/**
 * Extract statement rows from PDF-extracted text. Returns every line that
 * has both a parseable date and at least one well-formed amount; header,
 * narrative and balance-only lines fall out naturally.
 *
 * Order of authority: a recognized bank letterhead seeds the layout (column
 * order + balance column), then the keyword heuristics. If the seeded layout
 * extracts nothing (a fingerprint can only ever be a guess about an
 * individual PDF), the heuristic layout gets a full retry before the
 * fragmented-layout fallbacks.
 */
export function extractTransactionsFromText(text: string): RawImportRow[] {
  const lines = text.split(/\r?\n|\f/);
  const fingerprint = detectBankFingerprint(text);
  const seeded = fingerprint ? BANK_LAYOUTS[fingerprint] : null;
  const heuristicLayout = detectLayout(lines);
  const layout = seeded ? seeded.layout : heuristicLayout;
  const heuristicHasBalance = detectBalanceColumn(lines);
  const hasBalance = seeded ? seeded.hasBalance || heuristicHasBalance : heuristicHasBalance;

  const rows = extractWithLayout(lines, layout, hasBalance, text);

  // The letterhead guess produced nothing — fall back to the pure keyword
  // heuristics before giving up (and before the fragment layouts).
  if (rows.length === 0 && seeded && (heuristicLayout !== layout || heuristicHasBalance !== hasBalance)) {
    return extractWithLayout(lines, heuristicLayout, heuristicHasBalance, text);
  }
  return rows;
}

/** One pass of the line-based extraction under a chosen layout. */
function extractWithLayout(
  lines: string[],
  layout: LayoutKind,
  hasBalance: boolean,
  text: string,
): RawImportRow[] {
  const rows: RawImportRow[] = [];
  if (layout === "debit-credit") {
    rows.push(...extractDebitCreditRows(lines, hasBalance, text));
  } else {
    lines.forEach((line, index) => {
      const row = extractRow(line, index + 1, layout);
      if (row) rows.push(row);
    });
  }
  if (rows.length === 0) {
    // Some banks render each cell as its own text fragment (no physical line
    // holds a full row), so the header keywords never share a line. Detect the
    // money-in/money-out signature anywhere in the text and rebuild rows from
    // column positions instead.
    const lower = text.toLowerCase();
    if (
      layout === "credit-debit" ||
      (lower.includes("money in") && lower.includes("money out"))
    ) {
      return extractCreditDebitTextRows(text);
    }
  }
  return rows;
}

/**
 * Parse a PDF statement buffer into the canonical import shape. Throws an
 * actionable error when no transaction-like lines are found (scanned PDFs,
 * unsupported layouts) so the wizard can show it verbatim.
 */
export async function parsePdf(
  bytes: Uint8Array,
): Promise<{ headers: string[]; rows: RawImportRow[] }> {
  // pdf-parse wraps pdfjs-dist, which references browser globals (DOMMatrix,
  // Path2D, ImageData) at module-evaluation time and polyfills them from
  // @napi-rs/canvas when it is importable. Load the polyfill first so the
  // evaluation of pdf-parse never throws. Both packages are in
  // serverExternalPackages, so Node resolves them from node_modules.
  await import("@napi-rs/canvas");
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: bytes });
  let text: string;
  try {
    // lineEnforce inserts a newline when the y position changes (row breaks
    // from geometry, not from hasEOL markers many bank PDFs omit), and
    // itemJoiner keeps cells on the same row separated by a space instead of
    // concatenating them into a space-less blob. Without this, table rows
    // rendered as separate text items produce no parseable lines.
    const result = await parser.getText({ lineEnforce: true, itemJoiner: " " });
    text = result.text;
  } finally {
    await parser.destroy().catch(() => undefined);
  }

  const rows = extractTransactionsFromText(text);
  if (rows.length === 0) {
    const compact = text.replace(/\s+/g, " ").trim();
    // Scanned/image-only statements have almost no text layer — no parsing
    // tweak will ever find rows, so say so directly.
    if (compact.length < 200) {
      throw new Error(
        "This PDF has no readable text layer — it is likely a scanned image, which can't be read as a statement. Export a CSV or Excel (.xlsx) version of the statement and import that instead.",
      );
    }
    // Log the first chunk so a failing bank layout can be diagnosed from the
    // server logs; it never reaches the browser or a database. The excerpt
    // preserves line breaks so fragment-per-cell layouts stay visible.
    console.info(
      "[ledgerai-pdf] zero rows extracted",
      JSON.stringify({
        diag: "v4-fragmented",
        chars: text.length,
        lines: text.split(/\r?\n|\f/).length,
        bank: detectBankFingerprint(text),
        layout: detectLayout(text.split(/\r?\n|\f/)),
        hasBalance: detectBalanceColumn(text.split(/\r?\n|\f/)),
        dateLines: text
          .split(/\r?\n|\f/)
          .filter((line) => findDate(line) !== null).length,
        rawExcerpt: text.slice(0, 1500),
      }),
    );
    throw new Error(
      "We couldn't find any transactions in this PDF. Each transaction row needs a date and an amount together on the same line, for example \"05 Jan 2026  POS transfer  12,500.00\". If this statement is a scanned image, export a CSV or Excel (.xlsx) version instead.",
    );
  }
  return { headers: [...PDF_IMPORT_HEADERS], rows };
}
