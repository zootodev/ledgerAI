import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/lib/services/overview", () => ({
  LOW_CONFIDENCE_THRESHOLD: 0.6,
  getOverviewActionItems: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) =>
    createElement("a", { href }, children),
}));

import { getOverviewActionItems } from "@/lib/services/overview";
import { OverviewActionItems } from "@/components/dashboard/overview-actions";

describe("Overview banner copy", () => {
  it("keeps spaces between the count, the verb and the import summary", async () => {
    vi.mocked(getOverviewActionItems).mockResolvedValue({
      uncategorizedCount: 0,
      lowConfidenceCount: 2,
      lowConfidenceGroups: 1,
      latestImport: {
        id: "import-1",
        filename: "hark-test-import.csv",
        imported: 1,
        found: 1,
        existingDuplicates: 0,
        invalidRows: 0,
      },
    } as never);

    const html = renderToStaticMarkup(await OverviewActionItems());

    expect(html).toContain("2 transactions in 1 group need a quick check");
    expect(html).toContain('href="/review"');
    expect(html).toContain("Start review");
    expect(html).toContain('href="/transactions?lowConfidence=1"');
    expect(html).toContain("Review row by row");
    expect(html).toContain("hark-test-import.csv");
    expect(html).toContain("1 of 1 row");
    expect(html).not.toContain(".csv1 of 1 row");
  });
});
