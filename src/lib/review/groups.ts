// ============================================================
// LedgerAI — low-confidence review grouping (pure, tenant-agnostic)
// ------------------------------------------------------------
// Groups pending review rows by a READABLE bank-statement label plus the
// AI's suggested category. Raw narration is kept only as samples so a phone
// number or a date fragment never becomes the card title. The service layer
// supplies only rows already scoped to the session's business.
// ============================================================

import { majorAmount } from "@/lib/finance/engine";
import { normalizeText } from "@/lib/import/normalize";

export interface ReviewRowInput {
  id: string;
  description: string;
  amount: string;
  date: string;
  categoryId: string | null;
  aiCategory: string | null;
  aiConfidence: number | null;
  type: "income" | "expense" | "transfer";
}

export interface ReviewGroup {
  /** Stable key derived from cleaned label + suggested category. */
  key: string;
  /** Readable label shown as the card title (never raw narration). */
  label: string;
  /** "Income", "Expense", "Transfer" or a slash-joined mix. */
  typeLabel: string;
  rowCount: number;
  /** Absolute total in major currency units. */
  totalAmount: number;
  dateFrom: string;
  dateTo: string;
  suggestedCategory: string;
  /** First three raw descriptions, oldest first. */
  samples: string[];
  /** Every row in the group, including single-row override targets. */
  rows: ReviewRowInput[];
}

const CURRENCY = /₦|\bNGN\b/gi;
/** Phone numbers and references are 6+ contiguous digits in OPay narration. */
const LONG_DIGITS = /\b\d{6,}\b/g;
const SIZE = /\b\d+(?:\.\d+)?\s?(?:gb|mb)\b/gi;
const BRACKETED_DURATION =
  /\([^)]*\b(?:days?|weeks?|months?|mins?|minutes?|hours?|gb|mb)\b[^)]*\)/gi;
const REPEATED_WORD = /\b(\w+)(?:\s+\1)+\b/gi;
const DATE_FRAGMENT =
  /\b(?:0?[1-9]|[12]\d|3[01])[A-Z]{3}(?:\d{4})?\b|\b[A-Z]{3}(?:0?[1-9]|[12]\d|3[01])\b/g;

/** Statement plumbing that never makes a readable counterparty. */
const PLUMBING_WORDS: ReadonlySet<string> = new Set([
  "POS", "ATM", "USSD", "WEB", "NIP", "TRF", "TFR", "REF", "PURCHASE",
  "PAYMENT", "VIA", "DEBIT", "CREDIT", "ONLINE", "MOBILE",
]);

/** Single words that are too generic to use as a card title on their own. */
const GENERIC_SINGLE_WORDS: ReadonlySet<string> = new Set([
  "PLAN", "WEEKLY", "MONTHLY", "DAILY", "MINS", "MIN", "MINUTES", "BUNDLE",
  "CAMPUS", "PURCHASE", "PAYMENT", "WITHDRAWAL", "CASH", "AIRTIME",
]);

const ACRONYMS: ReadonlySet<string> = new Set([
  "MTN", "GLO", "POS", "ATM", "NIP", "USSD", "OPAY", "NGN", "GTB", "UBA", "BTC",
]);

/** Collapse statement noise without losing the counterparty phrase. */
export function cleanReviewDescription(raw: string): string {
  const cleaned = normalizeText(raw)
    .replace(CURRENCY, " ")
    .replace(LONG_DIGITS, " ")
    .replace(BRACKETED_DURATION, " ")
    .replace(SIZE, " ")
    .toUpperCase()
    .replace(REPEATED_WORD, "$1")
    .replace(DATE_FRAGMENT, " ");

  return normalizeText(
    cleaned
      .split(/[^A-Z0-9]+/)
      .filter((token) => token !== "" && !PLUMBING_WORDS.has(token))
      .join(" "),
  );
}

function titleCase(value: string): string {
  const titled = value
    .toLowerCase()
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase())
    .replace(/\b(mtn|glo|pos|atm|nip|ussd|opay|ngn|gtb|uba|btc)\b/gi, (word) =>
      ACRONYMS.has(word.toUpperCase()) ? word.toUpperCase() : word,
    );
  return normalizeText(titled);
}

/**
 * Map the common Nigerian bank-statement shapes to a human label. The raw
 * description is still stored on each sample row; only the card title is
 * normalised here. Transfer labels keep the counterparty name.
 */
export function reviewGroupLabel(raw: string): string {
  const cleaned = cleanReviewDescription(raw);
  if (!cleaned) return "Unlabelled transaction";

  const transfer = /^TRANSFER\s+(TO|FROM)\s+(.+)$/.exec(cleaned);
  if (transfer) {
    const name = normalizeText(transfer[2]);
    return name ? `Transfer – ${titleCase(name)}` : "Transfer";
  }

  if (/\bAIRTIME\b|\bRECHARGE\b|\bTOP\s*UP\b/.test(cleaned)) return "Airtime";

  if (
    /\bDATA\b|\bPLAN\b|\bBUNDLE\b|\bMINS?\b|\bMINUTES\b/.test(cleaned)
  ) {
    return "Mobile data";
  }

  if (/\bPOS\b|\bATM\b|\bWITHDRAWAL\b/.test(cleaned)) return "Cash withdrawal";

  const words = cleaned.split(" ");
  if (words.length === 1 && GENERIC_SINGLE_WORDS.has(words[0])) {
    return "Unlabelled transaction";
  }

  return titleCase(cleaned).slice(0, 64);
}

/** Stable, case-insensitive grouping key for a description's readable label. */
export function reviewMerchantKey(description: string): string {
  return reviewGroupLabel(description).toUpperCase();
}

function groupKey(label: string, aiCategory: string | null): string {
  return `${label}\u0000${normalizeText(aiCategory ?? "No suggestion").toUpperCase()}`;
}

function typeLabelFor(rows: ReviewRowInput[]): string {
  const types = [...new Set(rows.map((row) => row.type))];
  return types
    .map((type) => (type === "income" ? "Income" : type === "expense" ? "Expense" : "Transfer"))
    .join(" / ");
}

/**
 * Group low-confidence rows by readable label + suggested category. Groups
 * are ordered by absolute amount so the money that matters most is reviewed
 * first; the key tie-break keeps the order deterministic.
 */
export function groupLowConfidenceRows(rows: ReviewRowInput[]): ReviewGroup[] {
  const buckets = new Map<string, ReviewRowInput[]>();
  for (const row of rows) {
    const key = groupKey(reviewMerchantKey(row.description), row.aiCategory);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(row);
    else buckets.set(key, [row]);
  }

  return [...buckets.entries()]
    .map(([key, groupRows]): ReviewGroup => {
      const ordered = [...groupRows].sort((a, b) => a.date.localeCompare(b.date));
      const suggested = normalizeText(ordered[0].aiCategory ?? "No suggestion");
      return {
        key,
        label: reviewGroupLabel(ordered[0].description),
        typeLabel: typeLabelFor(ordered),
        rowCount: ordered.length,
        totalAmount: ordered.reduce(
          (sum, row) => sum + Math.abs(majorAmount(row.amount)),
          0,
        ),
        dateFrom: ordered[0].date,
        dateTo: ordered[ordered.length - 1].date,
        suggestedCategory: suggested || "No suggestion",
        samples: ordered.slice(0, 3).map((row) => row.description),
        rows: ordered,
      };
    })
    .sort(
      (a, b) => b.totalAmount - a.totalAmount || a.label.localeCompare(b.label),
    );
}
