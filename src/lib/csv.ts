/**
 * Minimal RFC 4180 CSV serialization with spreadsheet formula-injection
 * protection. No dependencies — the report export never needs more than this.
 *
 * Every TEXT cell is escaped defensively: fields containing a comma, double
 * quote, CR or LF are wrapped in double quotes and embedded quotes are
 * doubled. Line endings are CRLF so the files open cleanly in spreadsheet
 * applications.
 *
 * Formula-injection protection (OWASP CSV Injection): a TEXT cell that starts
 * with `=`, `+`, `-` or `@` (what a spreadsheet would interpret as a formula,
 * expression or handle) is neutralized with a leading `'` guard, e.g.
 *   `=SUM(A1:A2)`  ->  `'=SUM(A1:A2)`
 * This stops a user-controlled value (a category or description typed by a
 * user in another tenant) from executing when the exported file is opened.
 *
 * NUMERIC cells (JS numbers and `numericCell()` tagged values) are NEVER
 * neutralized — a legitimate negative figure like `-123.45` must not gain a
 * `'` prefix. Prefer a real number / `numericCell()` for report figures and
 * reserve plain strings for human-readable text (which is neutralized).
 */

/** Any value that can be serialized into a CSV cell. */
export type CsvCell = string | number | NumericCell | null | undefined;

/** A cell explicitly tagged as numeric. Serialized verbatim, never neutralized. */
export interface NumericCell {
  readonly kind: "numeric";
  readonly text: string;
}

/**
 * Tag a pre-formatted numeric value (e.g. `round(x, 2).toFixed(2)`) as
 * numeric so the serializer emits it verbatim and never treats it as formula
 * text. Prefer this over a plain string for report figures.
 */
export function numericCell(text: string): NumericCell {
  return { kind: "numeric", text };
}

/** Characters that can start a spreadsheet formula (OWASP CSV Injection). */
const FORMULA_START = /^[=+\-@]/;

/** Neutralize a TEXT cell that a spreadsheet would read as a formula. */
export function neutralizeFormula(value: string): string {
  return FORMULA_START.test(value) ? `'${value}` : value;
}

/** Escape a single TEXT field per RFC 4180, neutralizing formula starts first. */
export function csvEscape(value: string): string {
  const guarded = neutralizeFormula(value);
  if (/[",\r\n]/.test(guarded)) {
    return `"${guarded.replace(/"/g, '""')}"`;
  }
  return guarded;
}

/** Normalize one cell to CSV text (null/undefined become empty fields). */
function formatCell(value: CsvCell): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return String(value);
  // Only a string or the numeric-tagged cell remains — route each branch
  // explicitly so the serializer can never accidentally neutralize a number.
  if (typeof value === "string") return csvEscape(value);
  return value.text;
}

/** Serialize a header row plus data rows to RFC 4180 CSV text. */
export function toCsv(
  headers: readonly string[],
  rows: ReadonlyArray<ReadonlyArray<CsvCell>>,
): string {
  const lines = [headers, ...rows].map((row) =>
    row.map((cell) => formatCell(cell)).join(","),
  );
  return lines.join("\r\n") + "\r\n";
}