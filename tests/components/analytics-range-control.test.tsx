import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({
  usePathname: () => "/overview",
  useRouter: () => ({ push: vi.fn() }),
}));

import { AnalyticsRangeControl } from "@/components/dashboard/analytics-range-control";
import {
  buildRangePresets,
  resolveActivePresetId,
  withRangeSelection,
} from "@/lib/analytics/range-preset";

/** Labels of the pills currently marked active. */
function activePresetLabels(html: string): string[] {
  return [...html.matchAll(/<button[^>]*aria-pressed="true"[^>]*>([^<]*)<\/button>/g)].map(
    (m) => m[1],
  );
}

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

describe("AnalyticsRangeControl — ?preset= highlights the exact pill", () => {
  // The ambiguous day: month and quarter both start on the 1st.
  const OCT_18 = new Date("2026-10-18T12:00:00Z");
  const presets = buildRangePresets(OCT_18);

  it("month and quarter share a window on 2026-10-18", () => {
    const month = presets.find((p) => p.id === "month")!;
    const quarter = presets.find((p) => p.id === "quarter")!;
    expect(month.from).toBe("2026-10-01");
    expect(month.to).toBe("2026-10-18");
    expect(quarter.from).toBe("2026-10-01");
    expect(quarter.to).toBe("2026-10-18");
  });

  it("clicking This quarter highlights only This quarter", () => {
    // The click writes ?preset=quarter along with the bounds.
    const clicked = withRangeSelection(new URLSearchParams(), {
      from: "2026-10-01",
      to: "2026-10-18",
      presetId: "quarter",
    });
    const params = Object.fromEntries(clicked.entries());

    expect(params.preset).toBe("quarter");
    expect(params.from).toBe("2026-10-01");
    expect(params.to).toBe("2026-10-18");

    const html = renderToStaticMarkup(
      createElement(AnalyticsRangeControl, {
        from: "2026-10-01",
        to: "2026-10-18",
        params,
      }),
    );
    expect(activePresetLabels(html)).toEqual(["This quarter"]);
  });

  it("falls back to date matching only when the preset param is absent", () => {
    // Without ?preset= the shared window can only resolve to the first match,
    // which is why the param is needed at all.
    expect(
      resolveActivePresetId({ from: "2026-10-01", to: "2026-10-18", presets }),
    ).toBe("month");
    expect(
      resolveActivePresetId({
        preset: "quarter",
        from: "2026-10-01",
        to: "2026-10-18",
        presets,
      }),
    ).toBe("quarter");
  });

  it("ignores an unknown preset param and falls back to the bounds", () => {
    expect(
      resolveActivePresetId({
        preset: "decade",
        from: "2026-10-01",
        to: "2026-10-18",
        presets,
      }),
    ).toBe("month");
  });

  it("still highlights exactly one pill when no preset param is present", () => {
    // Bounds are taken from today's presets so the test does not depend on the
    // real calendar date the suite happens to run on.
    const month = buildRangePresets(new Date()).find((p) => p.id === "month")!;
    const html = renderToStaticMarkup(
      createElement(AnalyticsRangeControl, { from: month.from, to: month.to }),
    );
    expect(activePresetLabels(html)).toEqual(["This month"]);
  });
});

describe("withRangeSelection", () => {
  it("records the preset and bounds on a preset click", () => {
    const next = withRangeSelection(new URLSearchParams(), {
      from: "2026-10-01",
      to: "2026-10-18",
      presetId: "quarter",
    });
    expect(next.get("preset")).toBe("quarter");
    expect(next.get("from")).toBe("2026-10-01");
    expect(next.get("to")).toBe("2026-10-18");
  });

  it("clears a stored preset when From/To are edited manually", () => {
    const base = new URLSearchParams("preset=quarter&from=2026-10-01&to=2026-10-18");
    const next = withRangeSelection(base, { from: "2026-10-05", to: "2026-10-18" });
    expect(next.get("preset")).toBeNull();
    expect(next.get("from")).toBe("2026-10-05");
  });

  it("writes range=all and drops the bounds for the all-time preset", () => {
    const base = new URLSearchParams("from=2026-10-01&to=2026-10-18");
    const next = withRangeSelection(base, { from: "", to: "", presetId: "all" });
    expect(next.get("preset")).toBe("all");
    expect(next.get("range")).toBe("all");
    expect(next.get("from")).toBeNull();
    expect(next.get("to")).toBeNull();
  });

  it("preserves unrelated params", () => {
    const base = new URLSearchParams("accountId=abc&search=rent");
    const next = withRangeSelection(base, { from: "2026-10-01", to: "2026-10-18", presetId: "month" });
    expect(next.get("accountId")).toBe("abc");
    expect(next.get("search")).toBe("rent");
  });
});
