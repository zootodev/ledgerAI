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
  } else if (/(?:\boutward\b|withdraw|\bmoney out\b|paid out|charge|\bfee\b)/i.test(sideText)) {
    debit = lastTrans.value;
  } else if (/(?:\binward\b|deposit|\bmoney in\b|received|\bsalary\b|\bincome\b)/i.test(sideText)) {
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
  const leading = line.slice(date.end, first.start);
  const trailing = line.slice(first.end);
  const description = leading
    .trim()
    .replace(/^[\s|:;]+/, "")
    .replace(/[\s|:;]+$/, "");

  let debit = "";
  let credit = "";

  if (layout === "debit-credit") {
    if (amounts.length >= 2) {
      // Column position is authoritative: emit absolute values so
      // normalize.ts never flags "debit value must be positive".
      debit = amounts[0].value;
      credit = amounts[1].value;
    } else if (first.negative) {
      debit = first.value;
    } else {
      credit = first.value;
    }
  } else if (
    first.negative ||
    /\bdr\b/i.test(leading) ||
    /\b(dr|debit|withdrawal|money out|paid out)\b/i.test(trailing)
  ) {
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
 */
export function extractTransactionsFromText(text: string): RawImportRow[] {
  const lines = text.split(/\r?\n|\f/);
  const layout = detectLayout(lines);
  const rows: RawImportRow[] = [];
  lines.forEach((line, index) => {
    const row = extractRow(line, index + 1, layout);
    if (row) rows.push(row);
  });
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
    // server logs; it never reaches the browser or a database.
    console.info(
      "[ledgerai-pdf] zero rows extracted",
      JSON.stringify({
        chars: text.length,
        lines: text.split(/\r?\n|\f/).length,
        excerpt: compact.slice(0, 1200),
      }),
    );
    throw new Error(
      "We couldn't find any transactions in this PDF. Each transaction row needs a date and an amount together on the same line, for example \"05 Jan 2026  POS transfer  12,500.00\". If this statement is a scanned image, export a CSV or Excel (.xlsx) version instead.",
    );
  }
  return { headers: [...PDF_IMPORT_HEADERS], rows };
}
