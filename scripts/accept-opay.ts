// ============================================================
// LedgerAI — local OPay acceptance harness
// ------------------------------------------------------------
// Reads tmp/opay-nov-2026.pdf (never committed) and prints ONLY aggregate
// counts/totals. It deliberately never prints descriptions, names, account
// numbers, references or raw statement text.
//
// Run: npx tsx scripts/accept-opay.ts
// Missing file: exits 0 with a SKIP line.
// ============================================================

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parsePdf, parsePdfLegacy } from "../src/lib/import/parse-pdf";
import { prepareImport, type PreparedImport } from "../src/lib/import/prepare";
import { categorizeImportRows } from "../src/lib/import/categorize";
import type {
  ColumnMapping,
  ImportSection,
  NormalizedImportRow,
  ParsedImportFile,
  RawImportRow,
} from "../src/lib/import/types";

const STATEMENT_PATH = resolve(process.cwd(), "tmp", "opay-nov-2026.pdf");

const PDF_MAPPING: ColumnMapping = {
  date: "Date",
  description: "Description",
  reference: "Reference",
  debit: "Debit",
  credit: "Credit",
  amount: "Amount",
  balance: "Balance",
  type: "Type",
};

const EXPECTED = {
  walletRows: 50,
  walletDebitCount: 27,
  walletDebitTotal: 82_757,
  walletCreditCount: 23,
  walletCreditTotal: 81_757,
  opening: 1_000,
  closing: 0,
  internal: 24,
  real: 26,
  realOutCount: 21,
  realOutTotal: 47_120,
  realInCount: 5,
  realInTotal: 45_187,
  selfTransfers: 2,
  interestRows: 10,
  interestTotal: 2.26,
  duplicateSweeps: 0,
};

interface Metrics {
  rows: number;
  debitCount: number;
  debitTotal: number;
  creditCount: number;
  creditTotal: number;
  opening: number | null;
  closing: number | null;
  chainOk: boolean;
  chainChecked: number;
  chainMismatches: number;
  headerGateOk: boolean | null;
  internal: number;
  real: number;
  realOutCount: number;
  realOutTotal: number;
  realInCount: number;
  realInTotal: number;
  selfTransfers: number;
  interestRows: number;
  interestTotal: number;
  sweepSetAside: number;
  duplicateSweeps: number;
}

function numberOrNull(value: string | null | undefined): number | null {
  if (value === null || value === undefined || value.trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function money(value: number | null): string {
  if (value === null) return "n/a";
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function directionOf(row: NormalizedImportRow, raw: RawImportRow | undefined): "in" | "out" | null {
  const values = raw?.values ?? {};
  const debit = numberOrNull(values.Debit);
  const credit = numberOrNull(values.Credit);
  if (debit !== null && debit > 0) return "out";
  if (credit !== null && credit > 0) return "in";
  if (row.amount.trim().startsWith("-")) return "out";
  if (row.type === "income") return "in";
  if (row.type === "expense") return "out";
  return null;
}

function metricsFor(
  parsed: ParsedImportFile,
  prepared: PreparedImport,
  rows: NormalizedImportRow[],
): Metrics {
  const rec = prepared.reconciliation;
  const totals = rec?.parsedTotals;
  const realRows = rows.filter((row) => !row.skipped && row.errors.length === 0);
  let realOutCount = 0;
  let realOutTotal = 0;
  let realInCount = 0;
  let realInTotal = 0;
  for (const row of realRows) {
    const amount = Number(row.amount);
    if (!Number.isFinite(amount)) continue;
    const direction = directionOf(row, parsed.rows[row.rowIndex]);
    if (direction === "out") {
      realOutCount += 1;
      realOutTotal += Math.abs(amount);
    } else if (direction === "in") {
      realInCount += 1;
      realInTotal += Math.abs(amount);
    }
  }

  const interestRows = rows.filter((row) => row.transfer?.kind === "interest");
  const headerChecks = rec?.headerChecks?.length ?? 0;

  return {
    rows: totals?.count ?? realRows.length,
    debitCount: totals?.debitCount ?? 0,
    debitTotal: Number(totals?.debit ?? 0),
    creditCount: totals?.creditCount ?? 0,
    creditTotal: Number(totals?.credit ?? 0),
    opening: numberOrNull(rec?.openingBalance),
    closing: numberOrNull(rec?.closingBalance),
    chainOk: !!rec && rec.checked > 0 && rec.mismatches.length === 0,
    chainChecked: rec?.checked ?? 0,
    chainMismatches: rec?.mismatches.length ?? 0,
    headerGateOk: headerChecks > 0 ? !(rec?.requiresAcknowledgement ?? false) : null,
    internal: rows.filter((row) => row.skipReason === "internal transfer").length,
    real: realRows.length,
    realOutCount,
    realOutTotal,
    realInCount,
    realInTotal,
    selfTransfers: rows.filter((row) => row.transfer?.kind === "self").length,
    interestRows: interestRows.length,
    interestTotal: interestRows.reduce((sum, row) => sum + Math.abs(Number(row.amount) || 0), 0),
    sweepSetAside: rows.filter((row) => row.skipReason === "internal transfer").length,
    duplicateSweeps: rows.filter(
      (row) => row.transfer?.kind === "mirrored" && !row.skipped,
    ).length,
  };
}

function mark(ok: boolean): string {
  return ok ? "PASS" : "FAIL";
}

function near(actual: number | null, expected: number, tolerance = 0.01): boolean {
  return actual !== null && Math.abs(actual - expected) <= tolerance;
}

function printComparison(metrics: Metrics): void {
  const checks: [string, boolean][] = [
    ["wallet rows", metrics.rows === EXPECTED.walletRows],
    ["wallet debit count", metrics.debitCount === EXPECTED.walletDebitCount],
    ["wallet debit total", near(metrics.debitTotal, EXPECTED.walletDebitTotal)],
    ["wallet credit count", metrics.creditCount === EXPECTED.walletCreditCount],
    ["wallet credit total", near(metrics.creditTotal, EXPECTED.walletCreditTotal)],
    ["opening balance", near(metrics.opening, EXPECTED.opening)],
    ["closing balance", near(metrics.closing, EXPECTED.closing)],
    ["balance chain", metrics.chainOk],
    ["header gate", metrics.headerGateOk === true],
    ["internal moves", metrics.internal === EXPECTED.internal],
    ["real transactions", metrics.real === EXPECTED.real],
    ["real out count", metrics.realOutCount === EXPECTED.realOutCount],
    ["real out total", near(metrics.realOutTotal, EXPECTED.realOutTotal)],
    ["real in count", metrics.realInCount === EXPECTED.realInCount],
    ["real in total", near(metrics.realInTotal, EXPECTED.realInTotal)],
    ["own-account transfers", metrics.selfTransfers === EXPECTED.selfTransfers],
  ];

  console.log("");
  console.log("Expected vs actual");
  console.log(`  wallet rows              ${metrics.rows} / ${EXPECTED.walletRows}  ${mark(metrics.rows === EXPECTED.walletRows)}`);
  console.log(`  debits                   ${metrics.debitCount} / ${EXPECTED.walletDebitCount} rows, NGN ${money(metrics.debitTotal)} / ${money(EXPECTED.walletDebitTotal)}  ${mark(checks[1][1] && checks[2][1])}`);
  console.log(`  credits                  ${metrics.creditCount} / ${EXPECTED.walletCreditCount} rows, NGN ${money(metrics.creditTotal)} / ${money(EXPECTED.walletCreditTotal)}  ${mark(checks[3][1] && checks[4][1])}`);
  console.log(`  opening / closing        NGN ${money(metrics.opening)} / ${money(EXPECTED.opening)}, NGN ${money(metrics.closing)} / ${money(EXPECTED.closing)}  ${mark(checks[5][1] && checks[6][1])}`);
  console.log(`  balance chain            ${metrics.chainChecked} checked, ${metrics.chainMismatches} mismatches  ${mark(checks[7][1])}`);
  console.log(`  header gate              ${metrics.headerGateOk === null ? "n/a" : metrics.headerGateOk ? "clear" : "acknowledgement required"}  ${mark(checks[8][1])}`);
  console.log(`  internal moves           ${metrics.internal} / ${EXPECTED.internal}  ${mark(checks[9][1])}`);
  console.log(`  real transactions        ${metrics.real} / ${EXPECTED.real}  ${mark(checks[10][1])}`);
  console.log(`  real out                 ${metrics.realOutCount} / ${EXPECTED.realOutCount} rows, NGN ${money(metrics.realOutTotal)} / ${money(EXPECTED.realOutTotal)}  ${mark(checks[11][1] && checks[12][1])}`);
  console.log(`  real in                  ${metrics.realInCount} / ${EXPECTED.realInCount} rows, NGN ${money(metrics.realInTotal)} / ${money(EXPECTED.realInTotal)}  ${mark(checks[13][1] && checks[14][1])}`);
  console.log(`  own-account transfers    ${metrics.selfTransfers} / ${EXPECTED.selfTransfers}  ${mark(checks[15][1])}`);
  console.log(`  savings interest         ${metrics.interestRows} / ${EXPECTED.interestRows} rows, NGN ${metrics.interestTotal.toFixed(2)} / approx ${EXPECTED.interestTotal.toFixed(2)}  ${mark(metrics.interestRows === EXPECTED.interestRows && near(metrics.interestTotal, EXPECTED.interestTotal, 0.05))}`);
  console.log(`  savings sweeps set aside ${metrics.sweepSetAside}`);
  console.log(`  duplicate sweeps         ${metrics.duplicateSweeps} / ${EXPECTED.duplicateSweeps}  ${mark(metrics.duplicateSweeps === EXPECTED.duplicateSweeps)}`);
  console.log("");
  console.log(`RESULT: ${checks.every(([, ok]) => ok) && metrics.interestRows === EXPECTED.interestRows && near(metrics.interestTotal, EXPECTED.interestTotal, 0.05) && metrics.duplicateSweeps === EXPECTED.duplicateSweeps ? "PASS" : "FAIL"}`);
}

function walletAndSavings(sections: ImportSection[]): { wallet: ImportSection | null; savings: ImportSection | null } {
  const wallet =
    sections.find((section) => /wallet/i.test(section.label)) ??
    sections[0] ??
    null;
  const savings =
    sections.find((section) => /saving/i.test(section.label)) ??
    sections.find((section) => section.id !== wallet?.id) ??
    null;
  return { wallet, savings };
}

async function prepareSection(
  parsed: ParsedImportFile,
  section: ImportSection | null,
): Promise<PreparedImport> {
  const prepared = prepareImport(parsed, PDF_MAPPING, {
    selectedSectionId: section?.id ?? null,
  });
  // Exercise the categorization stage too; this script prints only aggregates.
  await categorizeImportRows(prepared.rows);
  return prepared;
}

async function main(): Promise<void> {
  if (!existsSync(STATEMENT_PATH)) {
    console.log("SKIP: tmp/opay-nov-2026.pdf not found");
    return;
  }

  const bytes = readFileSync(STATEMENT_PATH);
  const originalInfo = console.info;
  const originalWarn = console.warn;
  // The parser can log diagnostics containing raw statement excerpts. The
  // acceptance harness must never print personal data, so silence them here.
  console.info = () => undefined;
  console.warn = () => undefined;
  try {
    const parsed = await parsePdf(bytes);
    const file: ParsedImportFile = { ...parsed, fileName: "opay.pdf", fileType: "pdf" };
    const sections = parsed.sections ?? [];
    const { wallet, savings } = walletAndSavings(sections);

    console.log("LedgerAI OPay acceptance");
    console.log(`extractor: ${parsed.extractor ?? "unknown"}`);
    console.log(`sections found: ${sections.length}`);
    console.log(
      `section row counts: ${sections.map((section) => section.rowCount).join(" / ")}`,
    );

    if (!wallet) {
      console.log("RESULT: FAIL (no wallet section)");
      return;
    }

    const walletPrepared = await prepareSection(file, wallet);
    const walletMetrics = metricsFor(file, walletPrepared, walletPrepared.rows);
    console.log("");
    console.log("Wallet");
    console.log(`  rows ${walletMetrics.rows}`);
    console.log(`  debits ${walletMetrics.debitCount} rows, NGN ${money(walletMetrics.debitTotal)}`);
    console.log(`  credits ${walletMetrics.creditCount} rows, NGN ${money(walletMetrics.creditTotal)}`);
    console.log(`  opening NGN ${money(walletMetrics.opening)}`);
    console.log(`  closing NGN ${money(walletMetrics.closing)}`);
    console.log(`  balance chain ${walletMetrics.chainOk ? "OK" : "MISMATCH"} (${walletMetrics.chainChecked} checked, ${walletMetrics.chainMismatches} mismatches)`);
    console.log(`  header gate ${walletMetrics.headerGateOk === null ? "n/a" : walletMetrics.headerGateOk ? "clear" : "ACKNOWLEDGEMENT REQUIRED"}`);
    console.log(`  internal moves ${walletMetrics.internal}`);
    console.log(`  real transactions ${walletMetrics.real}`);
    console.log(`  real out ${walletMetrics.realOutCount} rows, NGN ${money(walletMetrics.realOutTotal)}`);
    console.log(`  real in ${walletMetrics.realInCount} rows, NGN ${money(walletMetrics.realInTotal)}`);
    console.log(`  own-account transfers ${walletMetrics.selfTransfers}`);

    let savingsMetrics: Metrics | null = null;
    if (savings) {
      const savingsPrepared = await prepareSection(file, savings);
      savingsMetrics = metricsFor(file, savingsPrepared, savingsPrepared.rows);
      console.log("");
      console.log("Savings");
      console.log(`  rows ${savingsMetrics.rows}`);
      console.log(`  interest ${savingsMetrics.interestRows} rows, NGN ${savingsMetrics.interestTotal.toFixed(2)}`);
      console.log(`  sweeps set aside ${savingsMetrics.sweepSetAside}`);
      console.log(`  duplicate sweeps ${savingsMetrics.duplicateSweeps}`);
    }

    const combined: Metrics = {
      ...walletMetrics,
      interestRows: savingsMetrics?.interestRows ?? 0,
      interestTotal: savingsMetrics?.interestTotal ?? 0,
      sweepSetAside: savingsMetrics?.sweepSetAside ?? 0,
      duplicateSweeps:
        (walletMetrics.duplicateSweeps ?? 0) + (savingsMetrics?.duplicateSweeps ?? 0),
    };
    printComparison(combined);

    console.log("Legacy pdf-parse path (before)");
    try {
      const legacy = await parsePdfLegacy(bytes);
      const legacyPrepared = prepareImport(
        { ...legacy, fileName: "opay.pdf", fileType: "pdf" },
        PDF_MAPPING,
      );
      const legacyMetrics = metricsFor(
        { ...legacy, fileName: "opay.pdf", fileType: "pdf" },
        legacyPrepared,
        legacyPrepared.rows,
      );
      console.log(`  rows ${legacyMetrics.rows}`);
      console.log(`  debits ${legacyMetrics.debitCount} rows, NGN ${money(legacyMetrics.debitTotal)}`);
      console.log(`  credits ${legacyMetrics.creditCount} rows, NGN ${money(legacyMetrics.creditTotal)}`);
      console.log(`  opening NGN ${money(legacyMetrics.opening)}`);
      console.log(`  closing NGN ${money(legacyMetrics.closing)}`);
      console.log(`  balance chain ${legacyMetrics.chainOk ? "OK" : "MISMATCH"} (${legacyMetrics.chainChecked} checked, ${legacyMetrics.chainMismatches} mismatches)`);
      console.log(`  header gate ${legacyMetrics.headerGateOk === null ? "n/a" : legacyMetrics.headerGateOk ? "clear" : "ACKNOWLEDGEMENT REQUIRED"}`);
      console.log(`  internal moves ${legacyMetrics.internal}`);
      console.log(`  real transactions ${legacyMetrics.real}`);
      console.log(`  real out ${legacyMetrics.realOutCount} rows, NGN ${money(legacyMetrics.realOutTotal)}`);
      console.log(`  real in ${legacyMetrics.realInCount} rows, NGN ${money(legacyMetrics.realInTotal)}`);
      console.log(`  own-account transfers ${legacyMetrics.selfTransfers}`);
    } catch (error) {
      console.log(`  FAILED: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  } finally {
    console.info = originalInfo;
    console.warn = originalWarn;
  }
}

main().catch((error) => {
  console.error(`ACCEPTANCE FAILED: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 1;
});
