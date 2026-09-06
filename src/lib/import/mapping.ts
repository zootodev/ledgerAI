// ============================================================
// LedgerAI — Column detection and mapping
// ------------------------------------------------------------
// Conservative automatic detection of common financial columns from
// a CSV/XLSX header row. Detection is deliberately not clever: exact
// alias matches win, then a single demonstrable token match per field.
// Manual mapping always remains the fallback.
// ============================================================

import type { ColumnMapping, ImportField } from "./types";

interface AliasSet {
  aliases: string[];
  tokens: string[];
}

const FIELD_ALIASES: Record<ImportField, AliasSet> = {
  date: {
    aliases: ["date", "transaction date", "posting date", "value date", "txn date", "trans date"],
    tokens: ["date"],
  },
  description: {
    aliases: [
      "description",
      "details",
      "narration",
      "transaction details",
      "memo",
      "particulars",
      "transaction description",
    ],
    tokens: ["narration", "description", "particulars", "details"],
  },
  amount: {
    aliases: ["amount", "transaction amount", "value"],
    tokens: ["amount"],
  },
  debit: {
    aliases: ["debit", "debit amount", "withdrawal", "withdrawals", "paid out", "money out"],
    tokens: ["debit", "withdrawal"],
  },
  credit: {
    aliases: ["credit", "credit amount", "deposit", "deposits", "paid in", "money in"],
    tokens: ["credit", "deposit"],
  },
  reference: {
    aliases: [
      "reference",
      "ref",
      "transaction id",
      "transaction reference",
      "txn ref",
      "ref no",
      "reference no",
      "receipt",
    ],
    tokens: ["reference", "ref"],
  },
  type: {
    aliases: ["type", "transaction type", "txn type"],
    tokens: ["type"],
  },
  category: {
    aliases: ["category", "category name"],
    tokens: ["category"],
  },
};

function normalizeHeader(value: string): string {
  return value.toLowerCase().trim().replace(/\s+/g, " ").replace(/[()[\]]/g, "");
}

/**
 * Best-effort column mapping for a parsed header row. Uses each header at
 * most once; stops at the first confident assignment. Never invents a
 * mapping for an unrecognized column.
 */
export function detectColumns(headers: string[]): ColumnMapping {
  const normalized = headers.map(normalizeHeader);
  const used = new Set<number>();
  const mapping: ColumnMapping = {};

  const assign = (field: ImportField, headerIndex: number) => {
    if (mapping[field]) return; // already assigned
    mapping[field] = headers[headerIndex];
    used.add(headerIndex);
  };

  // Pass 1: exact alias matches.
  for (let i = 0; i < normalized.length; i += 1) {
    const name = normalized[i];
    if (!name || used.has(i)) continue;
    for (const field of Object.keys(FIELD_ALIASES) as ImportField[]) {
      if (FIELD_ALIASES[field].aliases.includes(name)) {
        assign(field, i);
        break;
      }
    }
  }

  // Pass 2: single demonstrable token match for fields still unassigned.
  for (let i = 0; i < normalized.length; i += 1) {
    const name = normalized[i];
    if (!name || used.has(i)) continue;
    for (const field of Object.keys(FIELD_ALIASES) as ImportField[]) {
      if (mapping[field]) continue;
      if (FIELD_ALIASES[field].tokens.some((token) => name.includes(token))) {
        assign(field, i);
        break;
      }
    }
  }

  return mapping;
}

export interface MappingIssue {
  field: ImportField;
  message: string;
}

/**
 * Validate a mapping against an actual header row. Enforces the required
 * fields and the amount scheme (single Amount column OR a Debit/Credit
 * pair). Used by the UI before building a preview and by the server before
 * committing.
 */
export function validateMapping(mapping: ColumnMapping, headers: string[]): MappingIssue[] {
  const issues: MappingIssue[] = [];
  const headerSet = new Set(headers);

  const required: ImportField[] = ["date", "description"];
  for (const field of required) {
    const value = mapping[field];
    if (!value || value.trim() === "") {
      issues.push({
        field,
        message: `Column mapping is missing a ${capitalize(field)} column.`,
      });
    } else if (!headerSet.has(value)) {
      issues.push({
        field,
        message: `Column mapping references a column (${value}) that does not exist in the file.`,
      });
    }
  }

  const hasAmount = Boolean(mapping.amount && mapping.amount.trim() !== "");
  const hasDebit = Boolean(mapping.debit && mapping.debit.trim() !== "");
  const hasCredit = Boolean(mapping.credit && mapping.credit.trim() !== "");

  if (!hasAmount && !hasDebit && !hasCredit) {
    issues.push({
      field: "amount",
      message: "Column mapping is missing an amount source (Amount, or Debit/Credit).",
    });
  }

  for (const field of ["amount", "debit", "credit", "reference", "type", "category"] as const) {
    const value = mapping[field];
    if (value && value.trim() !== "" && !headerSet.has(value)) {
      issues.push({
        field,
        message: `Column mapping references a column (${value}) that does not exist in the file.`,
      });
    }
  }

  return issues;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}