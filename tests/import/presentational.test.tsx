import { describe, expect, it, vi } from "vitest";
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ImportSummaryCards } from "@/components/import/import-summary-cards";
import { WizardStepper } from "@/components/import/import-stepper";
import { ImportHistory } from "@/components/import/import-history";
import { ImportExceptions } from "@/components/import/import-exceptions";
import {
  ImportSuccessDescription,
  ImportCompletePanel,
} from "@/components/import/import-wizard";
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
      errors: { invalidRows: 1, errors: [], existingDuplicates: 2, inFileDuplicates: 1, excluded: 1, exceptions: [] },
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
    // Every row uses the same "N of M imported" summary — no bare "+N" badge.
    expect(html).toContain("3 of 4 imported");
    expect(html).toContain("0 of 0 imported");
    expect(html).not.toContain("+3");
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
    exceptions: [],
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

describe("ImportExceptions", () => {
  const exceptions = [
    {
      sourceRow: 5,
      displayRow: 4,
      reason: "invalid" as const,
      description: "BROKEN",
      date: "13/02/2026",
      amount: "",
      messages: ["invalid amount"],
    },
    {
      sourceRow: 6,
      displayRow: 5,
      reason: "duplicate_existing" as const,
      description: "Stripe payout",
      date: "2026-02-14",
      amount: "4000.00",
      messages: [],
    },
    {
      sourceRow: 3,
      displayRow: 2,
      reason: "duplicate_in_file" as const,
      description: "UBER ride",
      date: "2026-01-05",
      amount: "2500.00",
      messages: [],
    },
    {
      sourceRow: 4,
      displayRow: 3,
      reason: "excluded" as const,
      description: "Rent payment",
      date: "2026-02-12",
      amount: "150000.00",
      messages: [],
    },
  ];

  it("renders nothing when there are no exceptions", () => {
    const html = renderToStaticMarkup(<ImportExceptions exceptions={[]} />);
    expect(html).toBe("");
  });

  it("labels each exception with its reason and row", () => {
    const html = renderToStaticMarkup(<ImportExceptions exceptions={exceptions} />);
    expect(html).toContain("Invalid");
    expect(html).toContain("Already in ledger");
    expect(html).toContain("Duplicate in file");
    expect(html).toContain("Skipped");
    expect(html).toContain("Row 4");
    expect(html).toContain("invalid amount");
  });
});

describe("ImportCompletePanel", () => {
  const result = {
    total: 4,
    imported: 3,
    invalid: 1,
    existingDuplicates: 2,
    inFileDuplicates: 1,
    excluded: 1,
    learnedRuleCount: 0,
    importId: "imp-1",
    exceptions: [],
  };

  it("shows the exception queue and an import-another action", () => {
    const withExceptions = {
      ...result,
      exceptions: [
        {
          sourceRow: 5,
          displayRow: 4,
          reason: "invalid" as const,
          description: "BROKEN",
          date: "13/02/2026",
          amount: "",
          messages: ["invalid amount"],
        },
      ],
    };
    const html = renderToStaticMarkup(
      <ImportCompletePanel result={withExceptions} onStartOver={() => {}} />,
    );
    expect(html).toContain("Import complete");
    expect(html).toContain("1 row");
    expect(html).toContain("not imported");
    expect(html).toContain("Import another statement");
    expect(html).toContain('href="/transactions"');
  });

  it("confirms when every row was handled", () => {
    const html = renderToStaticMarkup(
      <ImportCompletePanel result={result} onStartOver={() => {}} />,
    );
    expect(html).toContain("Every row in this statement was handled.");
  });
});