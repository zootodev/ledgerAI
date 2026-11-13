import { describe, expect, it } from "vitest";
import { parsePdf } from "@/lib/import/parse-pdf";
import { parseCsv } from "@/lib/import/parse-csv";
import { parseXlsx } from "@/lib/import/parse-xlsx";
import { prepareImport } from "@/lib/import/prepare";
import type { ParsedImportFile } from "@/lib/import/types";
import type { ColumnMapping } from "@/lib/import/types";
type ParsedLike = Pick<ParsedImportFile, "headers" | "rows" | "sections" | "statement">;
import {
  SYNTHETIC_LAYOUTS,
  HEADER_MISMATCH_LAYOUT,
  findLayout,
  mappingFor,
  pdfMappingFor,
  scannedStatementPdf,
  statementCsv,
  statementPdf,
  statementXlsx,
  type SyntheticLayout,
} from "@/lib/import/dev/synthetic-statements";

const HOLDER = "Ada Okafor";

function prepareSection(
  parsed: ParsedLike,
  layout: SyntheticLayout,
  sectionIndex: number,
  mapping: ColumnMapping = pdfMappingFor(),
) {
  const section = parsed.sections?.[sectionIndex];
  return prepareImport(
    { ...parsed, fileName: "synthetic", fileType: "pdf" },
    mapping,
    {
      selectedSectionId: section?.id ?? null,
      holderName: HOLDER,
      businessName: HOLDER,
    },
  );
}

function expectSectionMatches(
  parsed: ParsedLike,
  layout: SyntheticLayout,
  sectionIndex: number,
  mapping: ColumnMapping = pdfMappingFor(),
) {
  const section = layout.sections[sectionIndex];
  const prepared = prepareSection(parsed, layout, sectionIndex, mapping);
  const expected = section.expected;

  expect(prepared.reconciliation?.parsedTotals.count).toBe(expected.rows);
  expect(prepared.reconciliation).not.toBeNull();
  expect(prepared.reconciliation?.headerMismatches).toEqual([]);
  expect(prepared.reconciliation?.checked).toBeGreaterThan(0);
  expect(Number(prepared.reconciliation?.parsedTotals.debit)).toBeCloseTo(
    expected.debits,
    2,
  );
  expect(Number(prepared.reconciliation?.parsedTotals.credit)).toBeCloseTo(
    expected.credits,
    2,
  );
  expect(prepared.reconciliation?.parsedTotals.debitCount).toBe(expected.debitCount);
  expect(prepared.reconciliation?.parsedTotals.creditCount).toBe(expected.creditCount);
  expect(Number(prepared.reconciliation?.openingBalance)).toBeCloseTo(
    expected.openingBalance,
    2,
  );
  expect(Number(prepared.reconciliation?.closingBalance)).toBeCloseTo(
    expected.closingBalance,
    2,
  );
  expect(prepared.reconciliation?.requiresAcknowledgement).toBe(false);
  return prepared;
}

describe("synthetic statement corpus — PDF layouts", () => {
  for (const layout of SYNTHETIC_LAYOUTS) {
    it(`${layout.id}: parses every row with the right signs and totals`, async () => {
      const parsed = await parsePdf(statementPdf(layout));
      expect(parsed.sections ?? []).toHaveLength(layout.sections.length);
      expect(parsed.rows).toHaveLength(
        layout.sections.reduce((sum, section) => sum + section.rows.length, 0),
      );
      for (let index = 0; index < layout.sections.length; index += 1) {
        expectSectionMatches(parsed, layout, index);
      }
    }, 60000);
  }

  it("merges a wrapped description and split reference across a page break", async () => {
    const layout = findLayout("gtbank");
    const parsed = await parsePdf(statementPdf(layout));
    const first = parsed.rows.find((row) => row.values.Description?.includes("CHICKEN"));
    expect(first?.values.Description).toContain("LEKKI PHASE 1 LAGOS");
    expect(first?.values.Reference).toContain("GT-1001-A");
  }, 60000);

  it("uses the printed header totals as an acknowledgement gate", async () => {
    const parsed = await parsePdf(statementPdf(HEADER_MISMATCH_LAYOUT));
    const prepared = prepareSection(parsed, HEADER_MISMATCH_LAYOUT, 0);
    expect(prepared.reconciliation?.requiresAcknowledgement).toBe(true);
    expect(prepared.reconciliation?.message).toMatch(
      /Parsed 2 of 99 rows \/ totals differ by ₦/,
    );
    expect(prepared.reconciliation?.headerMismatches.length).toBeGreaterThan(0);
  }, 60000);

  it("sets aside mirrored internal transfers and keeps own-account transfers visible", async () => {
    const layout = findLayout("opay-two-section");
    const parsed = await parsePdf(statementPdf(layout));

    const wallet = prepareSection(parsed, layout, 0);
    expect(wallet.transfers.mirrored).toBe(2);
    expect(wallet.transfers.selfTransfers).toBe(2);
    expect(wallet.transfers.reversals).toBe(2);
    expect(wallet.transfers.interest).toBe(2);
    expect(wallet.rows.filter((row) => row.skipReason === "internal transfer")).toHaveLength(1);
    expect(wallet.rows.filter((row) => row.transfer?.kind === "self")).toHaveLength(2);
    expect(wallet.rows.filter((row) => row.transfer?.kind === "reversal")).toHaveLength(2);

    const savings = prepareSection(parsed, layout, 1);
    expect(savings.rows.filter((row) => row.skipReason === "internal transfer")).toHaveLength(1);
  }, 60000);

  it("shows the exact scan message for an image-only PDF", async () => {
    await expect(parsePdf(scannedStatementPdf())).rejects.toThrow(
      "This PDF is a scan; export a text PDF or CSV from your bank app",
    );
  });
});

describe("synthetic statement corpus — CSV and XLSX", () => {
  const tabular = [
    findLayout("kuda"),
    findLayout("gtbank"),
    findLayout("uba-first-single-amount"),
    findLayout("odd-columns"),
    findLayout("zero-closing"),
  ];

  for (const layout of tabular) {
    it(`${layout.id}: matches the PDF totals in CSV`, () => {
      const parsed = parseCsv(statementCsv(layout));
      expectSectionMatches(parsed, layout, 0, mappingFor(layout));
    });

    it(`${layout.id}: matches the PDF totals in XLSX`, () => {
      const parsed = parseXlsx(statementXlsx(layout));
      expectSectionMatches(parsed, layout, 0, mappingFor(layout));
    });
  }

  it("carries the header mismatch gate through CSV", () => {
    const parsed = parseCsv(statementCsv(HEADER_MISMATCH_LAYOUT));
    const prepared = prepareSection(
      parsed,
      HEADER_MISMATCH_LAYOUT,
      0,
      mappingFor(HEADER_MISMATCH_LAYOUT),
    );
    expect(prepared.reconciliation?.requiresAcknowledgement).toBe(true);
    expect(prepared.reconciliation?.headerMismatches.length).toBeGreaterThan(0);
  });
});
