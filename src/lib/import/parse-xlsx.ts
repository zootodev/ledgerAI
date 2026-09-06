// ============================================================
// LedgerAI — XLSX parser
// ------------------------------------------------------------
// Minimal SheetJS wrapper: read the most relevant worksheet, treat
// row 1 as the header row, and stringify every cell deterministically.
// Parser is pure: callers pass the raw bytes (ArrayBuffer).
// ============================================================

import * as XLSX from "xlsx";
import type { RawImportRow } from "./types";

export interface ParsedXlsxResult {
  headers: string[];
  rows: RawImportRow[];
  errors: { sourceRow: number; message: string }[];
}

/**
 * Parse XLSX bytes into raw rows. The first non-empty worksheet is used.
 * Throws a friendly Error for unreadable/non-spreadsheet input instead of
 * letting a generic "Error 500" escape.
 */
export function parseXlsx(buffer: ArrayBuffer): ParsedXlsxResult {
  if (!isZipContainer(buffer)) {
    throw new Error("This file could not be read as a spreadsheet. Use a .xlsx file exported from Excel or Google Sheets.");
  }

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  } catch {
    throw new Error("This file could not be read as a spreadsheet. Use a .xlsx file exported from Excel or Google Sheets.");
  }

  const sheet = firstNonEmptySheet(workbook);
  if (!sheet) {
    throw new Error("This spreadsheet has no data to import.");
  }

  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: "",
  });

  const rowsWithContent = grid
    .map((cells) => cells.map(cellToString))
    .filter((cells) => (cells as unknown[]).some((c) => c !== ""));

  if (rowsWithContent.length === 0) {
    throw new Error("This spreadsheet has no data rows to import.");
  }

  const headerRow = rowsWithContent[0];
  const headers = dedupeHeaders(headerRow);

  const rows: RawImportRow[] = [];
  for (let i = 1; i < rowsWithContent.length; i += 1) {
    const cells = rowsWithContent[i];
    const values: Record<string, string> = {};
    for (let col = 0; col < headers.length; col += 1) {
      values[headers[col]] = col < cells.length ? cells[col] : "";
    }
    rows.push({ sourceRow: i + 1, values });
  }

  return { headers, rows, errors: [] };
}

function firstNonEmptySheet(workbook: XLSX.WorkBook): XLSX.WorkSheet | null {
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    const range = sheet && sheet["!ref"];
    if (!range || !sheet || !sheet["!ref"]) continue;
    const cells = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: true,
      defval: "",
    });
    const hasContent = cells.some(
      (row) => (row as unknown[]).some((c) => c !== "" && c !== null && c !== undefined),
    );
    if (hasContent) return sheet;
  }
  return null;
}

/** A real .xlsx is a ZIP archive: signature PK\x03\x04 (or PK\x05\x06). */
function isZipContainer(buffer: ArrayBuffer): boolean {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 4) return false;
  return bytes[0] === 0x50 && bytes[1] === 0x4b;
}

function cellToString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return "";
    // SheetJS reconstructs date cells as the local calendar day that the
    // spreadsheet stored, so local getters are the correct decomposition.
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return String(value);
    return String(value);
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value).trim();
}

/** Rename repeated headers so each name is unique. */
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