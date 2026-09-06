import { describe, expect, it, vi } from "vitest";
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ImportSummaryCards } from "@/components/import/import-summary-cards";
import { WizardStepper } from "@/components/import/import-stepper";
import { ImportHistory } from "@/components/import/import-history";
import { ImportSuccessDescription } from "@/components/import/import-wizard";
import type { ImportHistoryItem } from "@/lib/services/imports";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) =>
    createElement("a", { href }, children),
}));

const SUMMARY = {
  total: 12,
  valid: 9,
  invalid: 3,
  duplicates: 4,
  needsReview: 2,
  readyToImport: 5,
  toSkip: 7,
};

describe("ImportSummaryCards", () => {
  it("renders the at-a-glance row counts", () => {
    const html = renderToStaticMarkup(<ImportSummaryCards summary={SUMMARY} />);
    expect(html).toContain("Rows found");
    expect(html).toContain(">12</");
    expect(html).toContain("Ready to import");
    expect(html).toContain(">5</");
    expect(html).toContain("Invalid rows");
    expect(html).toContain(">3</");
  });
});

describe("WizardStepper", () => {
  it("marks the current step and completed steps", () => {
    const html = renderToStaticMarkup(
      <WizardStepper
        steps={[{ id: 1, label: "Upload" }, { id: 2, label: "Map columns" }, { id: 3, label: "Review" }]}
        current={2}
      />,
    );
    expect(html).toContain('aria-current="step"');
    expect(html).toContain("Map columns");
    expect(html).toContain("Upload");
  });
});

describe("ImportHistory", () => {
  const items: ImportHistoryItem[] = [
    {
      id: "imp-1",
      filename: "moniepoint.csv",
      fileType: "csv",
      status: "committed",
      transactionsFound: 4,
      transactionsImported: 3,
      errors: { invalidRows: 1, errors: [], existingDuplicates: 2, inFileDuplicates: 1, excluded: 1 },
      createdAt: "2026-09-01T10:00:00.000Z",
      completedAt: "2026-09-01T10:00:00.000Z",
    },
    {
      id: "imp-2",
      filename: "O'Brien's statement.xlsx",
      fileType: "xlsx",
      status: "failed",
      transactionsFound: 0,
      transactionsImported: 0,
      errors: null,
      createdAt: "2026-08-01T09:00:00.000Z",
      completedAt: null,
    },
  ];

  it("renders the empty state when there are no imports", () => {
    const html = renderToStaticMarkup(<ImportHistory items={[]} />);
    expect(html).toContain("Nothing imported yet");
  });

  it("renders one row per import with badges and counts", () => {
    const html = renderToStaticMarkup(<ImportHistory items={items} />);
    expect(html).toContain("moniepoint.csv");
    expect(html).toContain("3 / 4 rows");
    expect(html).toContain("1 invalid");
    expect(html).toContain("2 already in ledger");
    expect(html).toContain("1 duplicate in file");
    expect(html).toContain("1 excluded");
    expect(html).toContain("committed");
    expect(html).toContain("O&#x27;Brien&#x27;s statement.xlsx");
  });
});

describe("ImportSuccessDescription", () => {
  const baseResult = {
    total: 4,
    imported: 3,
    invalid: 1,
    existingDuplicates: 2,
    inFileDuplicates: 1,
    excluded: 1,
    learnedRuleCount: 0,
    importId: "imp-1",
  };

  it("summarises the import result counts", () => {
    const html = renderToStaticMarkup(<ImportSuccessDescription result={baseResult} />);
    expect(html).toContain("3 imported");
    expect(html).toContain("2 already in ledger");
    expect(html).toContain("1 duplicate in file");
    expect(html).toContain("1 invalid");
    expect(html).toContain("1 excluded");
  });

  it("links to the rules page when corrections were learned", () => {
    const html = renderToStaticMarkup(
      <ImportSuccessDescription result={{ ...baseResult, learnedRuleCount: 2 }} />,
    );
    expect(html).toContain("Remembered 2 categorisations");
    expect(html).toContain('href="/settings/rules"');
  });

  it("never links to the rules page when nothing was learned", () => {
    const html = renderToStaticMarkup(<ImportSuccessDescription result={baseResult} />);
    expect(html).not.toContain("Remembered");
    expect(html).not.toContain('/settings/rules"');
  });
});