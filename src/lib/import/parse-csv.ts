// ============================================================
// LedgerAI — CSV parser
// ------------------------------------------------------------
// Structured CSV parsing via papaparse. Output is a header row plus
// raw data rows keyed by (de-duplicated) header name, each preserving
// its 1-based physical source row number. The parser is pure: callers
// own file I/O and pass a text string.
// ============================================================

import Papa from "papaparse";
import type { RawImportRow } from "./types";

export interface RowParseError {
  sourceRow: number;
  message: string;
}

export interface ParsedCsvResult {
  headers: string[];
  rows: RawImportRow[];
  errors: RowParseError[];
}

/**
 * Parse CSV text into raw rows. Returns useful, non-generic errors rather
 * than throwing. Empty/all-whitespace rows are skipped but the source row
 * numbers of kept rows reflect their real position in the file.
 */
export function parseCsv(text: string): ParsedCsvResult {
  const { data, errors } = Papa.parse<unknown[]>(text, {
    header: false,
    dynamicTyping: false,
    // Keep empty lines so sourceRow stays a physical line number; empty
    // rows are dropped below.
    skipEmptyLines: false,
  });

  const parseErrors: RowParseError[] = errors.flatMap((e) => {
    // papaparse auto-recovers when it only *notices* the delimiter rather
    // than confidently detecting it; that is not a problem to report.
    if (e.code === "UndetectableDelimiter") return [];
    const line = (e.row ?? 0) + 1;
    const detail = e.message.startsWith("Row ") ? e.message : `Parse issue on line ${line}: ${e.message}`;
    return [{ sourceRow: line, message: detail }];
  });

  const rawRows = data.filter((r) => Array.isArray(r));

  if (rawRows.length === 0) {
    return { headers: [], rows: [], errors: parseErrors };
  }

  const headerRow = (rawRows[0] as unknown[]).map(cellString);
  const headers = dedupeHeaders(headerRow);

  const rows: RawImportRow[] = [];

  for (let i = 1; i < rawRows.length; i += 1) {
    const cells = (rawRows[i] as unknown[]).map(cellString);
    if (cells.every((c) => c === "")) continue;

    const values: Record<string, string> = {};
    for (let col = 0; col < headers.length; col += 1) {
      values[headers[col]] = col < cells.length ? cells[col] : "";
    }
    rows.push({ sourceRow: i + 1, values });
  }

  return { headers, rows, errors: parseErrors };
}

function cellString(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

/**
 * Rename repeated headers so each name is unique and can be referenced in
 * a column mapping. E.g. ["Amount","Amount"] -> ["Amount","Amount (2)"].
 */
function dedupeHeaders(headers: string[]): string[] {
  const seen = new Map<string, number>();
  return headers.map((header) => {
    const base = header.trim();
    if (!base) return base;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base} (${count + 1})`;
  });
}