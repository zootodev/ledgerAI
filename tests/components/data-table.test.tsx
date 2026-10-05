import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DataTable, type Column } from "@/components/ui/data-table";
import { ImportRowsTable } from "@/components/import/import-rows-table";
import type { ImportPreviewRow } from "@/lib/import/types";

interface Row {
  id: string;
  label: string;
}

const columns: Column<Row>[] = [
  { key: "label", header: "Label", cell: (r) => r.label },
];

function rowData(ids: number[]): Row[] {
  return ids.map((id) => ({ id: `id-${id}`, label: `row-${id}` }));
}

function renderDataTable(data: Row[], page: number, total: number) {
  return renderToStaticMarkup(
    <DataTable
      columns={columns}
      data={data}
      rowKey={(r) => r.id}
      pagination={{
        page,
        pageSize: 20,
        total,
        onPageChange: vi.fn(),
      }}
    />,
  );
}

describe("DataTable pagination contract (server slices, table renders)", () => {
  it("renders a server-paginated page of rows without re-slicing (single-page regression)", () => {
    // Server already returned page 1 (rows 1-20 of 45).
    const html = renderDataTable(rowData(Array.from({ length: 20 }, (_, i) => i + 1)), 1, 45);

    expect(html).toContain("row-1");
    expect(html).toContain("row-20");
    expect(html).not.toContain("row-21");
    expect(html).toContain("Showing");
    expect(html).toContain("1 / 3");
  });

  it("renders page 2 rows fully instead of slicing them to empty (double-pagination regression)", () => {
    // Server already returned page 2 (rows 21-40 of 45). The table must NOT
    // treat these as the full dataset and slice them again by page.
    const html = renderDataTable(rowData(Array.from({ length: 20 }, (_, i) => i + 21)), 2, 45);

    expect(html).toContain("row-21");
    expect(html).toContain("row-40");
    expect(html).toContain("2 / 3");
    // Footer counts derive from the metadata, not the delivered data length.
    expect(html).toContain("21");
    expect(html).toContain("40");
  });

  it("shows the correct first-page range summary", () => {
    const html = renderDataTable(rowData(Array.from({ length: 20 }, (_, i) => i + 1)), 1, 45);
    expect(html).toMatch(rangeSummaryRegex(1, 20, 45));
  });

  it("renders every row when no pagination is requested", () => {
    const data = rowData([1, 2, 3]);
    const html = renderToStaticMarkup(
      <DataTable columns={columns} data={data} rowKey={(r) => r.id} />,
    );

    expect(html).toContain("row-1");
    expect(html).toContain("row-3");
    expect(html).not.toContain("Showing");
  });

  it("clamps a page past the last page in the footer (no misleading range)", () => {
    // Server clamped the data to the last-page slice (rows 41-45); the footer
    // must derive its page from the total, not the stale `page=99`.
    const html = renderDataTable(rowData(Array.from({ length: 5 }, (_, i) => i + 41)), 99, 45);

    expect(html).toContain("row-41");
    expect(html).toContain("row-45");
    expect(html).toContain("3 / 3");
    expect(html).toMatch(rangeSummaryRegex(41, 45, 45));
    expect(html).not.toContain("1961");
  });

  it("clamps a negative/zero page up to the first page in the footer", () => {
    const html = renderDataTable(rowData(Array.from({ length: 20 }, (_, i) => i + 1)), -3, 45);

    expect(html).toContain("1 / 3");
    expect(html).toMatch(rangeSummaryRegex(1, 20, 45));
  });

  it("hides the footer entirely when there are zero rows", () => {
    const html = renderDataTable([], 1, 0);

    expect(html).not.toContain("Showing");
    expect(html).not.toContain("/ 1");
  });

  it("leaves an exact-divisible last page on its own footer page", () => {
    const html = renderDataTable(rowData(Array.from({ length: 20 }, (_, i) => i + 41)), 3, 60);

    expect(html).toContain("3 / 3");
    expect(html).toMatch(rangeSummaryRegex(41, 60, 60));
  });
});

// Footer numbers live in separate <span>s, so the raw-HTML match must ignore tags.
function rangeSummaryRegex(start: number, end: number, total: number): RegExp {
  const gap = "(?:<[^>]*>|\\s)*";
  return new RegExp(
    ["Showing", gap, start, gap, "–", gap, end, gap, "of", gap, total].join(""),
  );
}

function importRow(displayRow: number, overrides: Partial<ImportPreviewRow> = {}): ImportPreviewRow {
  return {
    rowIndex: displayRow - 1,
    displayRow,
    sourceRow: displayRow + 1,
    date: "2026-08-01",
    description: `Row ${displayRow}`,
    amount: "10000.00",
    type: "income",
    reference: null,
    category: null,
    suggestedCategory: "Other Income",
    confidence: 0.9,
    duplicate: "new",
    duplicateOfRow: undefined,
    errors: [],
    warnings: [],
    valid: true,
    needsReview: false,
    ...overrides,
  };
}

describe("ImportRowsTable client-side page slicing", () => {
  it("slices the preview to 20 rows per page while the footer reflects the full total", () => {
    const rows = Array.from({ length: 45 }, (_, i) => importRow(i + 1));
    const html = renderToStaticMarkup(
      <ImportRowsTable
        rows={rows}
        currency="NGN"
        categories={[]}
        selections={{}}
        categoryOverrides={{}}
        onToggle={() => {}}
        onCategoryChange={() => {}}
      />,
    );

    // Page 1 shows rows 1-20 only.
    expect(html).toContain("#1");
    expect(html).toContain("#20");
    expect(html).not.toContain("#21");
    expect(html).not.toContain("#45");
    // Footer is driven by the full preview size.
    expect(html).toContain("1 / 3");
    expect(html).toMatch(rangeSummaryRegex(1, 20, 45));
  });
});