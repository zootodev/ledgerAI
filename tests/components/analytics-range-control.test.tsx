import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({
  usePathname: () => "/overview",
  useRouter: () => ({ push: vi.fn() }),
}));

import { AnalyticsRangeControl } from "@/components/dashboard/analytics-range-control";

describe("AnalyticsRangeControl — all-time state", () => {
  it("shows an explicit all-time label instead of blank date inputs", () => {
    const html = renderToStaticMarkup(createElement(AnalyticsRangeControl, {}));
    expect(html).toContain("All recorded transactions");
    expect(html).not.toContain('type="date"');
  });

  it("shows From/To inputs when a range is applied", () => {
    const html = renderToStaticMarkup(
      createElement(AnalyticsRangeControl, { from: "2026-09-01", to: "2026-09-30" }),
    );
    expect(html).toContain('type="date"');
    expect(html).toContain("2026-09-01");
    expect(html).toContain("2026-09-30");
    expect(html).not.toContain("All recorded transactions");
  });

  it("keeps the all-time chip when all time is explicitly selected via range=all", () => {
    const html = renderToStaticMarkup(
      createElement(AnalyticsRangeControl, { params: { range: "all" } }),
    );
    expect(html).toContain("All recorded transactions");
    expect(html).not.toContain('type="date"');
  });

  it("prefers explicit bounds when both bounds and range=all are present", () => {
    const html = renderToStaticMarkup(
      createElement(AnalyticsRangeControl, { from: "2026-09-01", to: "2026-09-30", params: { range: "all" } }),
    );
    // Explicit bounds take precedence: show inputs.
    expect(html).toContain('type="date"');
    expect(html).not.toContain("All recorded transactions");
  });
});
