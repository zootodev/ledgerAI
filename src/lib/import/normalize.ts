// ============================================================
// LedgerAI — Import normalization
// ------------------------------------------------------------
// Deterministic, conservative normalization of raw source cells into
// LedgerAI fields. Rules are explicit and testable:
//
// Dates:
//   YYYY-MM-DD / YYYY/MM/DD / YYYY.MM.DD
//   DD/MM/YYYY and DD-MM-YYYY (day-first). When the day part could
//   also be a month (day <= 12) the value is flagged as ambiguous:
//   a day-first value is still suggested so the review step can
//   confirm it, but it is never silently committed.
//
// Amounts (single Amount column):
//   positive -> income, negative -> expense (abs value stored),
//   zero -> invalid. Parenthesized values are negative (accounting).
//
// Debit/Credit columns:
//   debit -> expense, credit -> income. Zero-filled sides (blank, "-",
//   "0", "0.00", "₦0.00", "0,00") are treated as absent; exactly one
//   non-zero side wins. Both sides non-zero without an explicit transfer
//   type is ambiguous; both absent is "row has no amount".
//
// Transfers are ONLY produced when a mapped type column identifies
// them. Ordinary debit/credit rows never become transfers.
// ============================================================

import type {
  ColumnMapping,
  ImportRowType,
  NormalizedImportRow,
  RawImportRow,
} from "./types";

interface AmountResult {
  value: string;
  error?: string;
}

interface DateResult {
  value: string;
  error?: string;
  warning?: string;
}

/** Normalize free text: trim + collapse inner whitespace. */
export function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

/**
 * True when a Debit/Credit cell should be treated as ABSENT: blank, "-",
 * or a zero value in any common form ("0", "0.00", "₦0.00", "0,00")
 * after the same currency/number normalization used by parseAmount.
 */
export function isAbsentAmountCell(rawValue: string): boolean {
  const raw = normalizeText(rawValue);
  if (raw === "" || raw === "-") return true;

  let body = raw;
  if (body.startsWith("(") && body.endsWith(")")) {
    body = body.slice(1, -1).trim();
  }
  if (body.startsWith("-") || body.startsWith("+")) {
    body = body.slice(1).trim();
  }

  body = body
    .replace(/[₦$€£]/g, "")
    .replace(/NGN/gi, "")
    .replace(/\s+/g, "")
    .replace(/^\uFEFF/, "")
    .trim();

  if (body === "") return true;
  return /^0+$/.test(body.replace(/[,.]/g, ""));
}

export function parseAmount(rawValue: string): AmountResult {
  const raw = normalizeText(rawValue);
  if (raw === "") {
    return { value: "", error: "missing amount" };
  }

  let body = raw;

  // Accounting parentheses denote a negative amount: "(1,250.50)".
  if (body.startsWith("(") && body.endsWith(")")) {
    body = body.slice(1, -1).trim();
  }
  if (body.startsWith("-") || body.startsWith("+")) {
    body = body.slice(1).trim();
  }

  body = body
    .replace(/[₦$€£]/g, "")
    .replace(/NGN/gi, "")
    .replace(/\s+/g, "")
    .replace(/^\uFEFF/, "")
    .trim();

  const hasDot = body.includes(".");
  const hasComma = body.includes(",");

  let digits: string;

  if (hasDot && hasComma) {
    const lastComma = body.lastIndexOf(",");
    const lastDot = body.lastIndexOf(".");
    if (lastDot > lastComma) {
      // 1,250.50 style: comma is a thousands separator.
      digits = body.replace(/,/g, "");
    } else {
      return { value: "", error: "ambiguous amount format" };
    }
  } else if (hasComma) {
    // "1,250" could be a thousands separator or a European decimal.
    const parts = body.split(",");
    if (parts[0] !== "" && parts.length === 2 && /^\d{3}$/.test(parts[1])) {
      digits = body.replace(",", "");
    } else {
      return { value: "", error: "ambiguous amount format" };
    }
  } else {
    digits = body;
  }

  if (!/^\d+(\.\d{1,2})?$/.test(digits)) {
    return { value: "", error: "invalid amount" };
  }

  const [whole, fraction = ""] = digits.split(".");
  if (whole === "") {
    return { value: "", error: "invalid amount" };
  }

  const minorUnits = Number(whole) * 100 + fractionToMinor(fraction);
  if (minorUnits === 0 || !Number.isSafeInteger(minorUnits)) {
    return { value: "", error: "amount must be greater than zero" };
  }

  return { value: fromMinorUnits(minorUnits), error: undefined };
}

/** "5" or "05" -> 5 (major-units fraction to minor units). */
function fractionToMinor(fraction: string): number {
  return Number(fraction.padEnd(2, "0").slice(0, 2)) || 0;
}

/** Minor units -> major-units string ("125050" -> "1250.50"). */
function fromMinorUnits(minor: number): string {
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(minor);
  const whole = Math.floor(abs / 100);
  const cents = String(abs % 100).padStart(2, "0");
  return `${sign}${whole}.${cents}`;
}

export function parseDate(rawValue: string): DateResult {
  const raw = normalizeText(rawValue);
  if (raw === "") {
    return { value: "", error: "missing date" };
  }

  if (!/[0-9]/.test(raw)) {
    return { value: "", error: "invalid date" };
  }

  // ISO first.
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(raw);
  if (iso) {
    const [, y, m, d] = iso;
    const check = isValidCalendar(Number(y), Number(m), Number(d));
    if (!check) return { value: "", error: "invalid date" };
    return { value: `${y}-${pad(m)}-${pad(d)}` };
  }

  const isoSlash = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(raw);
  if (isoSlash) {
    const [, y, m, d] = isoSlash;
    if (!isValidCalendar(Number(y), Number(m), Number(d))) {
      return { value: "", error: "invalid date" };
    }
    return { value: `${y}-${pad(m)}-${pad(d)}` };
  }

  const isoDot = /^(\d{4})\.(\d{1,2})\.(\d{1,2})$/.exec(raw);
  if (isoDot) {
    const [, y, m, d] = isoDot;
    if (!isValidCalendar(Number(y), Number(m), Number(d))) {
      return { value: "", error: "invalid date" };
    }
    return { value: `${y}-${pad(m)}-${pad(d)}` };
  }

  // Day-first: DD/MM/YYYY, DD-MM-YYYY or DD.MM.YYYY.
  const dayFirst = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/.exec(raw);
  if (dayFirst) {
    const [, dRaw, mRaw, y] = dayFirst;
    const day = Number(dRaw);
    const month = Number(mRaw);
    if (!isValidCalendar(Number(y), month, day)) {
      return { value: "", error: "invalid date" };
    }
    const value = `${y}-${pad(month)}-${pad(day)}`;
    // If day <= 12 and month <= 12 the format could be month-first.
    const ambiguous = day <= 12 && month <= 12;
    return ambiguous
      ? { value, warning: "date format is ambiguous; day-first order was used" }
      : { value };
  }

  return { value: "", error: "invalid date format" };
}

function pad(value: number | string): string {
  return String(value).padStart(2, "0");
}

/** Strict calendar check without Date object timezone pitfalls. */
function isValidCalendar(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return false;
  }
  if (year < 1900 || year > 2200) return false;
  if (month < 1 || month > 12) return false;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day >= 1 && day <= daysInMonth;
}

const TYPE_SYNONYMS: Record<ImportRowType, string[]> = {
  income: ["credit", "cr", "income", "deposit", "in", "inflow", "received", "money in"],
  expense: ["debit", "dr", "expense", "withdrawal", "out", "outflow", "payment", "money out"],
  transfer: ["transfer", "internal", "own account", "between accounts"],
};

/** Parse a mapped "type" cell to a LedgerAI type, or null if unrecognized. */
export function inferTypeFromLabel(rawValue: string): ImportRowType | null {
  const label = normalizeText(rawValue).toLowerCase().replace(/\./g, "");
  if (!label) return null;
  if (label === "c" || label === "cr" || label === "credit") return "income";
  if (label === "d" || label === "dr" || label === "debit") return "expense";
  for (const [type, synonyms] of Object.entries(TYPE_SYNONYMS) as [ImportRowType, string[]][]) {
    if (synonyms.includes(label)) return type;
  }
  return null;
}

/**
 * Normalize one raw row through the current column mapping. Financial facts
 * (date, amount, type) come only from parsing rules here; categorization is
 * metadata added later.
 */
export function normalizeImportRow(
  raw: RawImportRow,
  mapping: ColumnMapping,
  rowIndex: number,
): NormalizedImportRow {
  const cell = (field: ImportFieldLike) => raw.values[mapping[field] ?? ""] ?? "";

  const dateResult = parseDate(cell("date"));
  const description = normalizeText(cell("description"));
  const ref = normalizeText(cell("reference"));
  const category = normalizeText(cell("category"));

  const errors: string[] = [];
  const warnings: string[] = [];

  if (dateResult.error) errors.push(dateResult.error);
  if (dateResult.warning) warnings.push(dateResult.warning);

  if (description === "") {
    errors.push("missing description");
  } else if (description.length > 200) {
    errors.push("description is too long");
  }

  let reference: string | null = ref === "" ? null : ref;
  if (reference && reference.length > 100) {
    errors.push("reference is too long");
    reference = null;
  }

  const typeFromLabel = parseTypeCell(cell("type"));

  const amountContext = resolveAmount(
    cell("amount"),
    cell("debit"),
    cell("credit"),
    typeFromLabel,
  );
  errors.push(...amountContext.errors);
  warnings.push(...amountContext.warnings);

  let type: ImportRowType;
  if (typeFromLabel) {
    type = typeFromLabel;
  } else if (amountContext.type) {
    type = amountContext.type;
  } else {
    type = "expense";
    errors.push("cannot determine income or expense type");
  }

  return {
    rowIndex,
    sourceRow: raw.sourceRow,
    date: errors.some((e) => e === "missing date" || e === "invalid date" || e === "invalid date format")
      ? ""
      : dateResult.value,
    rawDate: cell("date"),
    description,
    amount: amountContext.errors.length > 0 ? "" : amountContext.amount,
    type,
    reference,
    category: category === "" ? null : category.slice(0, 120),
    errors,
    warnings,
  };
}

type ImportFieldLike =
  | "date"
  | "description"
  | "amount"
  | "debit"
  | "credit"
  | "reference"
  | "type"
  | "category";

function parseTypeCell(value: string): ImportRowType | null {
  const normalized = value.trim().toLowerCase().replace(/\./g, "");
  if (normalized === "") return null;
  return inferTypeFromLabel(normalized);
}

interface AmountContext {
  amount: string;
  type: ImportRowType | null;
  errors: string[];
  warnings: string[];
}

/**
 * Deterministic amount + base type resolution.
 *
 * - Explicit type column wins for type, but the amount itself still must
 *   be parseable from the mapped columns.
 * - Debit -> expense, Credit -> income. Both nonzero is ambiguous unless
 *   the type column explicitly says "transfer" (then the debit value is
 *   used as the amount).
 * - Single Amount column: sign decides. Negative -> expense (abs stored).
 * - Zero is always invalid ("amount must be greater than zero").
 */
function resolveAmount(
  amountCell: string,
  debitCell: string,
  creditCell: string,
  explicitType: ImportRowType | null,
): AmountContext {
  const errors: string[] = [];
  const warnings: string[] = [];

  const hasAmount = amountCell.trim() !== "";
  const hasDebit = debitCell.trim() !== "";
  const hasCredit = creditCell.trim() !== "";

  if (explicitType === "transfer") {
    // Transfer: accept the debit value as the amount when type says so.
    // A zero-filled side of the pair counts as absent, so the real side
    // still wins for zero-filled bank exports.
    const debitPresent = hasDebit && !isAbsentAmountCell(debitCell);
    const creditPresent = hasCredit && !isAbsentAmountCell(creditCell);
    if (debitPresent) {
      const debit = parseAmount(debitCell);
      if (!debit.error) {
        return { amount: debit.value, type: "transfer", errors: [], warnings };
      }
    }
    if (creditPresent) {
      const credit = parseAmount(creditCell);
      if (!credit.error) {
        return { amount: credit.value, type: "transfer", errors: [], warnings };
      }
    }
    const single = parseAmount(amountCell);
    if (hasAmount && !single.error) {
      return { amount: single.value, type: "transfer", errors: [], warnings };
    }
    errors.push("missing amount for transfer");
    return { amount: "", type: "transfer", errors, warnings };
  }

  if (hasDebit || hasCredit) {
    // A zero-filled side of a Debit/Credit pair (blank, "-", "0", "0.00",
    // "₦0.00", "0,00") is treated as ABSENT — common in bank exports.
    const debitAbsent = !hasDebit || isAbsentAmountCell(debitCell);
    const creditAbsent = !hasCredit || isAbsentAmountCell(creditCell);
    const debit = debitAbsent ? { value: "", error: undefined } : parseAmount(debitCell);
    const credit = creditAbsent ? { value: "", error: undefined } : parseAmount(creditCell);
    const debitNegative = !debitAbsent && normalizeText(debitCell).startsWith("-");
    const creditNegative = !creditAbsent && normalizeText(creditCell).startsWith("-");

    if (!debitAbsent && debit.error) errors.push(debit.error ?? "invalid debit amount");
    if (!creditAbsent && credit.error) errors.push(credit.error ?? "invalid credit amount");
    if (debitNegative) errors.push("debit value must be positive");
    if (creditNegative) errors.push("credit value must be positive");

    if (errors.length > 0) {
      return { amount: "", type: null, errors, warnings };
    }

    if (!debitAbsent && !creditAbsent) {
      // Two populated amount columns without an explicit transfer type.
      errors.push("row has both debit and credit amounts");
      return { amount: "", type: null, errors, warnings };
    }

    if (!debitAbsent) {
      return { amount: debit.value, type: "expense", errors, warnings };
    }
    if (!creditAbsent) {
      return { amount: credit.value, type: "income", errors, warnings };
    }
    errors.push("row has no amount");
    return { amount: "", type: null, errors, warnings };
  }

  if (hasAmount) {
    const parsed = parseAmount(amountCell);
    if (parsed.error) {
      errors.push(parsed.error);
      return { amount: "", type: null, errors, warnings };
    }
    const negative = normalizeText(amountCell).startsWith("-") ||
      (normalizeText(amountCell).startsWith("(") && normalizeText(amountCell).endsWith(")"));
    // With an explicit Type column the type is authoritative: an unsigned
    // magnitude plus a separate type column is a valid, common export
    // shape. The ONLY true contradiction is negative income — a negative
    // amount can never be income — so that alone is flagged. The original
    // sign check above is evaluated BEFORE the abs value is stored.
    if (explicitType === "income" && negative) {
      errors.push("type conflicts with the amount sign");
      return { amount: "", type: "income", errors, warnings };
    }
    const type: ImportRowType = explicitType ?? (negative ? "expense" : "income");
    return { amount: parsed.value, type, errors, warnings };
  }

  errors.push("missing amount");
  return { amount: "", type: null, errors, warnings };
}