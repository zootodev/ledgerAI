// ============================================================
// LedgerAI — layout-aware PDF table extraction
// ------------------------------------------------------------
// This module is deliberately pure: callers give it positioned text items
// from pdfjs-dist and it returns the same synthetic Date/Description/... rows
// used by the rest of the import pipeline. Keeping geometry here makes the
// table logic unit-testable without a PDF file.
//
// The extractor does not assume a bank, a column order, or even a single
// table. It:
//   1. groups text items into lines by baseline y,
//   2. recognises header cells/keywords,
//   3. turns header anchors into x-bands,
//   4. starts a row only when the date band contains a date,
//   5. merges wrapped/continued lines and page-break fragments,
//   6. derives direction ONLY from debit/credit columns, Dr/Cr markers or the
//      balance delta.
// ============================================================

import type {
  ImportSection,
  RawImportRow,
  StatementHeaderSummary,
} from "./types";

export interface PdfTextItem {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  page: number;
}

export interface PdfLine {
  page: number;
  y: number;
  items: PdfTextItem[];
  text: string;
  minX: number;
  maxX: number;
}

export type PdfColumnField =
  | "date"
  | "time"
  | "description"
  | "debit"
  | "credit"
  | "amount"
  | "balance"
  | "reference"
  | "type";

export interface PdfColumnBand {
  field: PdfColumnField;
  start: number;
  end: number;
  anchorX: number;
}

export interface PdfTableHeader {
  lineIndex: number;
  page: number;
  bands: PdfColumnBand[];
  signature: string;
  fields: PdfColumnField[];
}

export interface PdfExtraction {
  headers: string[];
  rows: RawImportRow[];
  sections: ImportSection[];
  statement: StatementHeaderSummary;
}

const PDF_HEADERS = [
  "Date",
  "Time",
  "Description",
  "Debit",
  "Credit",
  "Balance",
  "Reference",
] as const;

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

const DATE_PATTERNS: { re: RegExp; build: (m: RegExpExecArray) => string | null }[] = [
  {
    re: /\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/,
    build: (m) => isoFrom(Number(m[1]), Number(m[2]), Number(m[3])),
  },
  {
    re: /\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})\b/,
    build: (m) => isoFrom(Number(m[3]), Number(m[2]), Number(m[1])),
  },
  {
    re: /\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2})\b/,
    build: (m) => isoFrom(2000 + Number(m[3]), Number(m[2]), Number(m[1])),
  },
  {
    re: /\b(\d{1,2})\s*[-/.]?\s*([A-Za-z]{3,9})\.?,?\s*[-/.]?\s*(\d{4})\b/,
    build: (m) => {
      const month = MONTHS[m[2].toLowerCase()];
      return month ? isoFrom(Number(m[3]), month, Number(m[1])) : null;
    },
  },
  {
    re: /\b([A-Za-z]{3,9})\.?,?\s*[-/.]?\s*(\d{1,2}),?\s*[-/.]?\s*(\d{4})\b/,
    build: (m) => {
      const month = MONTHS[m[1].toLowerCase()];
      return month ? isoFrom(Number(m[3]), month, Number(m[2])) : null;
    },
  },
];

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function isoFrom(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }
  if (year < 1900 || year > 2200 || month < 1 || month > 12) return null;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day < 1 || day > daysInMonth) return null;
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

export function findDateInText(text: string): string | null {
  let best: { iso: string; start: number } | null = null;
  for (const { re, build } of DATE_PATTERNS) {
    const match = re.exec(text);
    if (!match) continue;
    const iso = build(match);
    if (!iso) continue;
    if (!best || match.index < best.start) best = { iso, start: match.index };
  }
  return best?.iso ?? null;
}

function findTimeInText(text: string): string | null {
  const match = /\b(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?\b/i.exec(text);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] ?? 0);
  const meridiem = match[4]?.toLowerCase();
  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  if (hour > 23 || minute > 59 || second > 59) return null;
  return `${pad2(hour)}:${pad2(minute)}:${pad2(second)}`;
}

/** Group positioned items into physical text lines, top-to-bottom. */
export function groupPdfLines(items: PdfTextItem[]): PdfLine[] {
  const byPage = new Map<number, PdfTextItem[]>();
  for (const item of items) {
    const text = item.text.replace(/\s+/g, " ").trim();
    if (text === "") continue;
    const list = byPage.get(item.page) ?? [];
    list.push({ ...item, text });
    byPage.set(item.page, list);
  }

  const lines: PdfLine[] = [];
  for (const page of [...byPage.keys()].sort((a, b) => a - b)) {
    const pageItems = (byPage.get(page) ?? []).sort((a, b) => {
      if (Math.abs(a.y - b.y) > 1.5) return b.y - a.y;
      return a.x - b.x;
    });
    let current: PdfTextItem[] = [];
    let currentY = 0;
    let tolerance = 3;

    const flush = () => {
      if (current.length === 0) return;
      const sorted = [...current].sort((a, b) => a.x - b.x);
      lines.push({
        page,
        y: currentY,
        items: sorted,
        text: sorted.map((item) => item.text).join(" "),
        minX: Math.min(...sorted.map((item) => item.x)),
        maxX: Math.max(...sorted.map((item) => item.x + item.width)),
      });
      current = [];
    };

    for (const item of pageItems) {
      const height = item.height > 0 ? item.height : 8;
      const nextTolerance = Math.max(2.5, Math.min(7, height * 0.55));
      if (current.length === 0) {
        current = [item];
        currentY = item.y;
        tolerance = nextTolerance;
        continue;
      }
      if (Math.abs(item.y - currentY) <= tolerance) {
        current.push(item);
        currentY = (currentY * (current.length - 1) + item.y) / current.length;
      } else {
        flush();
        current = [item];
        currentY = item.y;
        tolerance = nextTolerance;
      }
    }
    flush();
  }
  return lines;
}

interface LineCell {
  text: string;
  start: number;
  end: number;
  center: number;
}

/** Merge adjacent items on a line into header cells. Descriptions may merge
 * into one cell — that is harmless because data is assigned item-by-item. */
function lineCells(line: PdfLine): LineCell[] {
  const cells: LineCell[] = [];
  let current: PdfTextItem[] = [];

  const flush = () => {
    if (current.length === 0) return;
    const sorted = [...current].sort((a, b) => a.x - b.x);
    const start = sorted[0].x;
    const end = Math.max(...sorted.map((item) => item.x + item.width));
    cells.push({
      text: sorted.map((item) => item.text).join(" ").replace(/\s+/g, " ").trim(),
      start,
      end,
      center: (start + end) / 2,
    });
    current = [];
  };

  for (const item of [...line.items].sort((a, b) => a.x - b.x)) {
    if (current.length === 0) {
      current = [item];
      continue;
    }
    const previous = current[current.length - 1];
    const previousEnd = previous.x + previous.width;
    if (item.x - previousEnd <= 8) {
      current.push(item);
    } else {
      flush();
      current = [item];
    }
  }
  flush();
  return cells;
}

function normalizeHeaderText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[()[\]{}]/g, " ")
    .replace(/[.,:;|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function headerFieldsForCell(text: string): PdfColumnField[] {
  const normalized = normalizeHeaderText(text);
  if (normalized === "") return [];
  const fields: PdfColumnField[] = [];

  // A combined type column must win before the individual debit/credit words.
  if (
    /^(dr\s*\/?\s*cr|debit\s*\/?\s*credit|transaction\s+type|txn\s+type|type)$/.test(
      normalized,
    )
  ) {
    return ["type"];
  }

  if (/\bbalance\b|\brunning\s+bal|\bclosing\s+bal|\bledger\s+bal|\bavailable\s+bal/.test(normalized)) {
    fields.push("balance");
  }
  if (
    /\bmoney\s+out\b|\bpaid\s+out\b|\bwithdrawal|\bdebit\b|\bdr\b|\boutflow\b|\bamount\s+out\b|\bout\b/.test(
      normalized,
    )
  ) {
    fields.push("debit");
  }
  if (
    /\bmoney\s+in\b|\bpaid\s+in\b|\bdeposit|\bcredit\b|\bcr\b|\binflow\b|\bamount\s+in\b|\bin\b/.test(
      normalized,
    )
  ) {
    fields.push("credit");
  }
  if (/\bvalue\s+date\b|\btransaction\s+date\b|\bposting\s+date\b|\btxn\s+date\b|\bdate\b/.test(normalized)) {
    fields.push("date");
  }
  if (/\btime\b/.test(normalized)) fields.push("time");
  if (
    /\bdescription\b|\bnarration\b|\bdetails\b|\bremarks?\b|\bparticulars?\b|\bnarrative\b/.test(
      normalized,
    )
  ) {
    fields.push("description");
  }
  if (
    /\breference\b|\bref\b|\btransaction\s+id\b|\btxn\s+id\b|\bchannel\b|\btransaction\s+reference\b/.test(
      normalized,
    )
  ) {
    fields.push("reference");
  }
  if (/^(amount|amt|transaction\s+amount|value)$/.test(normalized)) {
    fields.push("amount");
  }

  // A cell that is only a date/time label should not also become a
  // description via a substring match.
  return [...new Set(fields)];
}

function fieldPriority(field: PdfColumnField): number {
  switch (field) {
    case "date":
      return 10;
    case "description":
      return 9;
    case "debit":
      return 8;
    case "credit":
      return 8;
    case "amount":
      return 7;
    case "balance":
      return 6;
    case "reference":
      return 5;
    case "time":
      return 4;
    case "type":
      return 3;
  }
}

function chooseAnchors(cells: LineCell[]): { field: PdfColumnField; center: number; start: number; end: number }[] {
  const anchors: { field: PdfColumnField; center: number; start: number; end: number }[] = [];
  for (const cell of cells) {
    for (const field of headerFieldsForCell(cell.text)) {
      anchors.push({ field, center: cell.center, start: cell.start, end: cell.end });
    }
  }
  // One anchor per field: keep the highest-priority band, preferring the
  // left-most occurrence when a header repeats a word.
  const best = new Map<PdfColumnField, (typeof anchors)[number]>();
  for (const anchor of anchors) {
    const existing = best.get(anchor.field);
    if (!existing) {
      best.set(anchor.field, anchor);
      continue;
    }
    if (
      fieldPriority(anchor.field) > fieldPriority(existing.field) ||
      (fieldPriority(anchor.field) === fieldPriority(existing.field) &&
        anchor.center < existing.center)
    ) {
      best.set(anchor.field, anchor);
    }
  }
  return [...best.values()].sort((a, b) => a.center - b.center);
}

function bandsFromAnchors(
  anchors: { field: PdfColumnField; center: number; start: number; end: number }[],
  line: PdfLine,
): PdfColumnBand[] {
  if (anchors.length === 0) return [];
  const ordered = [...anchors].sort((a, b) => a.center - b.center);
  return ordered.map((anchor, index) => {
    const previous = ordered[index - 1];
    const next = ordered[index + 1];
    return {
      field: anchor.field,
      start: previous ? (previous.center + anchor.center) / 2 : line.minX - 24,
      end: next ? (anchor.center + next.center) / 2 : line.maxX + 40,
      anchorX: anchor.center,
    };
  });
}

/** Detect a header line and return its x-bands. */
function detectHeader(line: PdfLine, lineIndex: number): PdfTableHeader | null {
  const cells = lineCells(line);
  const anchors = chooseAnchors(cells);
  const fields = anchors.map((anchor) => anchor.field);
  const hasDate = fields.includes("date");
  const hasAmount = fields.some((field) => field === "amount" || field === "debit" || field === "credit");
  const hasLabel =
    fields.includes("description") || fields.includes("balance") || fields.includes("reference");
  if (!hasDate || !hasAmount || !hasLabel) return null;
  const bands = bandsFromAnchors(anchors, line);
  return {
    lineIndex,
    page: line.page,
    bands,
    fields,
    signature: bands.map((band) => band.field).join("|"),
  };
}

function itemOverlap(item: PdfTextItem, band: PdfColumnBand): number {
  const itemStart = item.x;
  const itemEnd = item.x + Math.max(item.width, 0.1);
  return Math.min(itemEnd, band.end) - Math.max(itemStart, band.start);
}

function assignLine(
  line: PdfLine,
  bands: PdfColumnBand[],
): { byField: Map<PdfColumnField, string[]>; unassigned: string[] } {
  const byField = new Map<PdfColumnField, string[]>();
  const unassigned: string[] = [];
  for (const item of [...line.items].sort((a, b) => a.x - b.x)) {
    let best: PdfColumnBand | null = null;
    let bestOverlap = 0;
    for (const band of bands) {
      const overlap = itemOverlap(item, band);
      if (overlap > bestOverlap) {
        best = band;
        bestOverlap = overlap;
      }
    }
    if (!best) {
      unassigned.push(item.text);
      continue;
    }
    const list = byField.get(best.field) ?? [];
    list.push(item.text);
    byField.set(best.field, list);
  }
  return { byField, unassigned };
}

function fieldText(byField: Map<PdfColumnField, string[]>, field: PdfColumnField): string {
  return (byField.get(field) ?? []).join(" ").replace(/\s+/g, " ").trim();
}

function compactFieldText(byField: Map<PdfColumnField, string[]>, field: PdfColumnField): string {
  return (byField.get(field) ?? []).join("").replace(/\s+/g, "").trim();
}

interface MoneyText {
  value: string;
  negative: boolean;
  explicitSign: boolean;
}

function parseMoneyText(raw: string, allowZero = false): MoneyText | null {
  const cleaned = raw
    .replace(/[₦$€£]/g, "")
    .replace(/NGN/gi, "")
    .replace(/\s+/g, "")
    .trim();
  if (cleaned === "" || cleaned === "-") return null;
  const negative = cleaned.includes("(") || /^-/.test(cleaned);
  const explicitSign = /^[-(]/.test(cleaned) || /^\+/.test(cleaned);
  const value = cleaned
    .replace(/[()]/g, "")
    .replace(/[-+]/g, "")
    .replace(/,/g, "");
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return null;
  const amount = Number(value);
  if (!Number.isFinite(amount) || (amount === 0 && !allowZero)) return null;
  return { value: amount.toFixed(2), negative, explicitSign };
}

function markerDirection(raw: string): "debit" | "credit" | null {
  const text = normalizeHeaderText(raw);
  if (text === "") return null;
  if (/^(dr|d|debit|withdrawal|money\s+out|out|outflow|paid\s+out)$/.test(text)) {
    return "debit";
  }
  if (/^(cr|c|credit|deposit|money\s+in|in|inflow|paid\s+in|received)$/.test(text)) {
    return "credit";
  }
  if (/\bdebit\b|\bwithdrawal\b|\bmoney\s+out\b|\boutflow\b/.test(text)) return "debit";
  if (/\bcredit\b|\bdeposit\b|\bmoney\s+in\b|\binflow\b/.test(text)) return "credit";
  return null;
}

function parseNumber(value: string | null): number | null {
  if (value === null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function cleanText(raw: string): string {
  return raw
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}

function parseLooseMoney(text: string): string | null {
  const match = /[-(]?\s*(?:₦|NGN)?\s*\d[\d,]*(?:\.\d{1,2})?\)?/i.exec(text);
  if (!match) return null;
  const parsed = parseMoneyText(match[0], true);
  if (!parsed) return null;
  return parsed.negative ? `-${parsed.value}` : parsed.value;
}

/** Balance keeps its sign; debit/credit/amount keep the direction separately. */
function signedMoney(parsed: MoneyText | null): string | null {
  if (!parsed) return null;
  return parsed.negative ? `-${parsed.value}` : parsed.value;
}

function emptySummary(): StatementHeaderSummary {
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

function updateSummary(summary: StatementHeaderSummary, text: string): void {
  const line = text.replace(/\s+/g, " ").trim();
  if (line === "" || findDateInText(line)) return;

  const opening = /opening\s*balance[^0-9()\n]*([-(]?\s*(?:₦|NGN)?\s*\d[\d,]*(?:\.\d{1,2})?\)?)/i.exec(
    line,
  );
  if (opening && summary.openingBalance === null) {
    summary.openingBalance = parseLooseMoney(opening[1]);
  }

  const closing = /closing\s*balance[^0-9()\n]*([-(]?\s*(?:₦|NGN)?\s*\d[\d,]*(?:\.\d{1,2})?\)?)/i.exec(
    line,
  );
  if (closing) summary.closingBalance = parseLooseMoney(closing[1]);

  const debit = /total\s*(?:debit|debits|withdrawal|withdrawals|money\s*out|outflow|paid\s*out)[^0-9()\n]*([-(]?\s*(?:₦|NGN)?\s*\d[\d,]*(?:\.\d{1,2})?\)?)/i.exec(
    line,
  );
  if (debit && summary.totalDebit === null) summary.totalDebit = parseLooseMoney(debit[1]);

  const credit = /total\s*(?:credit|credits|deposit|deposits|money\s*in|inflow|paid\s*in)[^0-9()\n]*([-(]?\s*(?:₦|NGN)?\s*\d[\d,]*(?:\.\d{1,2})?\)?)/i.exec(
    line,
  );
  if (credit && summary.totalCredit === null) summary.totalCredit = parseLooseMoney(credit[1]);

  const count =
    /total\s*(?:transactions?|txns?|count|rows?)[^0-9\n]*(\d+)/i.exec(line) ??
    /(\d+)\s*(?:transactions?|txns?|rows?)\b/i.exec(line);
  if (count && summary.transactionCount === null) {
    summary.transactionCount = Number(count[1]);
  }
  const debitCount = /(\d+)\s*(?:debits?|withdrawals?|money\s*out|outflows?)\b/i.exec(line);
  if (debitCount && summary.debitCount === null) summary.debitCount = Number(debitCount[1]);
  const creditCount = /(\d+)\s*(?:credits?|deposits?|money\s*in|inflows?)\b/i.exec(line);
  if (creditCount && summary.creditCount === null) summary.creditCount = Number(creditCount[1]);

  const accountName = /account\s*name\s*[:#-]\s*(.+)$/i.exec(line);
  if (accountName && summary.accountName === null) {
    summary.accountName = cleanText(accountName[1]).slice(0, 120);
  }
  const accountNumber = /(?:account|acct)\s*(?:number|no|#)?\s*[:#-]?\s*(\d{6,})\b/i.exec(line);
  if (accountNumber && summary.accountNumber === null) {
    summary.accountNumber = accountNumber[1];
  }

  if (/statement\s+period|period\s+from|from\s+\d/i.test(line)) {
    const dates = [...line.matchAll(/\b\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}\b|\b\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}\b/g)]
      .map((m) => findDateInText(m[0]))
      .filter((value): value is string => value !== null);
    if (dates.length > 0 && summary.periodFrom === null) summary.periodFrom = dates[0];
    if (dates.length > 1) summary.periodTo = dates[dates.length - 1];
  }
}

const SECTION_TITLE = /\b(wallet|savings?|owealth|target\s+savings|spend\s+and\s+save|current\s+account|domiciliary|loan|card|piggy|vault)\b/i;

function sectionIdentity(
  lines: PdfLine[],
  headerIndex: number,
): { title: string | null; accountName: string | null; accountNumber: string | null } {
  let title: string | null = null;
  let accountName: string | null = null;
  let accountNumber: string | null = null;
  const page = lines[headerIndex].page;
  for (let index = headerIndex - 1; index >= 0 && index >= headerIndex - 18; index -= 1) {
    const line = lines[index];
    if (line.page !== page) break;
    const text = line.text.replace(/\s+/g, " ").trim();
    if (text === "") continue;
    const account = /account\s*name\s*[:#-]\s*(.+)$/i.exec(text);
    if (account && accountName === null) accountName = cleanText(account[1]).slice(0, 120);
    const number = /(?:account|acct)\s*(?:number|no|#)?\s*[:#-]?\s*(\d{6,})\b/i.exec(text);
    if (number && accountNumber === null) accountNumber = number[1];
    if (title === null && text.length <= 80 && SECTION_TITLE.test(text)) {
      // Avoid taking a transaction description / a totals sentence as title.
      if (!/\b(total|balance|transaction|debit|credit|date|amount)\b/i.test(text)) {
        title = cleanText(text);
      }
    }
  }
  return { title, accountName, accountNumber };
}

interface RowDraft {
  page: number;
  lineIndex: number;
  date: string;
  time: string | null;
  descriptionParts: string[];
  referenceParts: string[];
  debit: string | null;
  credit: string | null;
  amount: string | null;
  amountSign: boolean | null;
  amountHadExplicitSign: boolean;
  balance: string | null;
  markerText: string;
  errors: string[];
  warnings: string[];
}

interface SectionBuild {
  id: string;
  label: string;
  rows: RawImportRow[];
  header: StatementHeaderSummary;
  bands: PdfColumnBand[];
  previousBalance: number | null;
  draft: RowDraft | null;
  title: string | null;
}

function makeSection(index: number, identity: { title: string | null; accountName: string | null; accountNumber: string | null }, header: StatementHeaderSummary): SectionBuild {
  const parts = [
    identity.title,
    identity.accountName,
    identity.accountNumber ? `••••${identity.accountNumber.slice(-4)}` : null,
  ].filter((part): part is string => !!part);
  return {
    id: `section-${index + 1}`,
    label: parts.length > 0 ? parts.join(" · ") : `Section ${index + 1}`,
    rows: [],
    header: { ...header, accountName: header.accountName ?? identity.accountName, accountNumber: header.accountNumber ?? identity.accountNumber },
    bands: [],
    previousBalance: null,
    draft: null,
    title: identity.title,
  };
}

function finalizeDraft(section: SectionBuild): void {
  const draft = section.draft;
  section.draft = null;
  if (!draft) return;

  if (section.previousBalance === null) {
    section.previousBalance = parseNumber(section.header.openingBalance);
  }

  const description = cleanText(draft.descriptionParts.join(" ")).slice(0, 200);
  const reference = cleanText(draft.referenceParts.join(" ")).slice(0, 100) || null;

  let debit = draft.debit;
  let credit = draft.credit;
  const amount = draft.amount;

  if (!debit && !credit && amount) {
    const marker = markerDirection(draft.markerText);
    let direction: "debit" | "credit" | null = marker;
    if (!direction && draft.balance !== null) {
      const balanceValue = parseNumber(draft.balance);
      if (balanceValue !== null && section.previousBalance !== null) {
        const delta = balanceValue - section.previousBalance;
        const movement = Math.abs(Number(amount));
        if (Math.abs(delta - movement) <= 0.01) direction = "credit";
        else if (Math.abs(delta + movement) <= 0.01) direction = "debit";
      }
    }
    if (!direction && draft.amountSign === true) direction = "debit";
    if (direction === "debit") debit = amount;
    if (direction === "credit") credit = amount;
    if (!direction) {
      draft.errors.push(
        "cannot determine debit or credit: no Dr/Cr marker and no balance change",
      );
    }
  }

  if (draft.balance !== null) {
    section.previousBalance = parseNumber(draft.balance);
  }

  const values: Record<string, string> = {
    Date: draft.date,
    Description: description,
    Debit: debit ?? "",
    Credit: credit ?? "",
    Balance: draft.balance ?? "",
    Reference: reference ?? "",
  };
  if (draft.time) values.Time = draft.time;

  section.rows.push({
    sourceRow: section.rows.length + 1,
    values,
    sectionId: section.id,
    errors: draft.errors.length > 0 ? [...draft.errors] : undefined,
    warnings: draft.warnings.length > 0 ? [...draft.warnings] : undefined,
  });
}

function startDraft(
  line: PdfLine,
  lineIndex: number,
  bands: PdfColumnBand[],
  date: string,
): RowDraft {
  const assigned = assignLine(line, bands);
  const dateText = fieldText(assigned.byField, "date");
  const time = findTimeInText(dateText) ?? findTimeInText(fieldText(assigned.byField, "time")) ?? findTimeInText(line.text);
  const description = fieldText(assigned.byField, "description");
  const reference = fieldText(assigned.byField, "reference");
  const debit = parseMoneyText(compactFieldText(assigned.byField, "debit"));
  const credit = parseMoneyText(compactFieldText(assigned.byField, "credit"));
  const amount = parseMoneyText(compactFieldText(assigned.byField, "amount"));
  const balance = parseMoneyText(compactFieldText(assigned.byField, "balance"), true);
  const marker = fieldText(assigned.byField, "type");

  return {
    page: line.page,
    lineIndex,
    date,
    time,
    descriptionParts: description ? [description] : assigned.unassigned.length > 0 ? [assigned.unassigned.join(" ")] : [],
    referenceParts: reference ? [reference] : [],
    debit: debit?.value ?? null,
    credit: credit?.value ?? null,
    amount: amount?.value ?? null,
    amountSign: amount ? amount.negative : null,
    amountHadExplicitSign: amount?.explicitSign ?? false,
    balance: signedMoney(balance),
    markerText: marker,
    errors: [],
    warnings: [],
  };
}

function continueDraft(draft: RowDraft, line: PdfLine, bands: PdfColumnBand[]): void {
  const assigned = assignLine(line, bands);
  const description = fieldText(assigned.byField, "description");
  const reference = fieldText(assigned.byField, "reference");
  if (description) draft.descriptionParts.push(description);
  if (reference) draft.referenceParts.push(reference);
  if (!draft.debit && !draft.credit && !draft.amount) {
    const debit = parseMoneyText(compactFieldText(assigned.byField, "debit"));
    const credit = parseMoneyText(compactFieldText(assigned.byField, "credit"));
    const amount = parseMoneyText(compactFieldText(assigned.byField, "amount"));
    if (debit) draft.debit = debit.value;
    if (credit) draft.credit = credit.value;
    if (amount) {
      draft.amount = amount.value;
      draft.amountSign = amount.negative;
      draft.amountHadExplicitSign = amount.explicitSign;
    }
  }
  if (!draft.balance) {
    const balance = parseMoneyText(compactFieldText(assigned.byField, "balance"), true);
    if (balance) draft.balance = signedMoney(balance);
  }
  if (!draft.markerText) {
    draft.markerText = fieldText(assigned.byField, "type");
  }
}

function summaryFromSection(section: SectionBuild): ImportSection {
  return {
    id: section.id,
    label: section.label,
    rowCount: section.rows.length,
    header: section.header,
    isDefault: false,
  };
}

/**
 * Turn positioned page items into rows and sections. The caller supplies the
 * pdfjs items; this function never loads a PDF itself.
 */
export function extractPdfTables(items: PdfTextItem[]): PdfExtraction {
  const lines = groupPdfLines(items);
  const sections: SectionBuild[] = [];
  let current: SectionBuild | null = null;
  let currentHeader: PdfTableHeader | null = null;
  const preamble = emptySummary();

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    // A line carrying a real transaction date is data, not a header, even if
    // its narration happens to contain words like "balance" or "amount".
    const header = findDateInText(line.text) ? null : detectHeader(line, index);

    if (header) {
      const identity = sectionIdentity(lines, index);
      const sameSection =
        current !== null &&
        (identity.title === null || (current.title !== null && identity.title === current.title)) &&
        (identity.accountNumber === null || current.header.accountNumber === null || identity.accountNumber === current.header.accountNumber);
      if (!sameSection) {
        if (current) finalizeDraft(current);
        const sectionIndex = sections.length;
        current = makeSection(
          sectionIndex,
          identity,
          sectionIndex === 0 ? { ...preamble } : emptySummary(),
        );
        if (identity.title) current.header.accountName = identity.accountName;
        sections.push(current);
        updateSummary(current.header, line.text);
      } else if (current) {
        // Repeated header on a new page: same section, refresh the bands.
        updateSummary(current.header, line.text);
      }
      currentHeader = header;
      if (current) current.bands = header.bands;
      continue;
    }

    if (!current) {
      // Preamble before the first table may carry the account identity and
      // opening balance. It is copied into the first section when it appears.
      updateSummary(preamble, line.text);
      continue;
    }

    updateSummary(current.header, line.text);
    if (currentHeader === null) continue;

    const assigned = assignLine(line, current.bands);
    const dateText = fieldText(assigned.byField, "date");
    const date = findDateInText(dateText);

    if (date) {
      finalizeDraft(current);
      current.draft = startDraft(line, index, current.bands, date);
      current.draft.time = findTimeInText(dateText) ?? findTimeInText(line.text);
      continue;
    }

    if (current.draft) {
      continueDraft(current.draft, line, current.bands);
    }
  }

  if (current) finalizeDraft(current);
  if (sections.length === 0) {
    return { headers: [...PDF_HEADERS], rows: [], sections: [], statement: emptySummary() };
  }

  const importSections = sections.map((section) => summaryFromSection(section));
  if (importSections.length > 0) importSections[0].isDefault = true;
  const rows = sections.flatMap((section) => section.rows);
  const statement: StatementHeaderSummary = {
    ...sections[0].header,
    accountName: sections[0].header.accountName ?? sections[0].label,
  };
  return { headers: [...PDF_HEADERS], rows, sections: importSections, statement };
}

/** Exposed for tests/diagnostics: the fields a header line recognises. */
export function headerFieldsForText(text: string): PdfColumnField[] {
  return headerFieldsForCell(text);
}

/** Exposed for tests: the direction marker vocabulary. */
export function directionFromMarker(text: string): "debit" | "credit" | null {
  return markerDirection(text);
}

/** Exposed for tests: numeric amount parsing used by the extractor. */
export function parsePdfMoney(text: string): string | null {
  return parseMoneyText(text)?.value ?? null;
}

export { PDF_HEADERS };
