import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { StatCard } from "@/components/ui/stat-card";

describe("StatCard delta tones", () => {
  it("renders a zero delta neutrally with no trend arrow", () => {
    const html = renderToStaticMarkup(<StatCard label="Revenue" value="₦1,000.00" delta="0%" />);
    expect(html).toContain("0%");
    expect(html).toContain("text-muted");
    expect(html).not.toContain("lucide-trending-up");
    expect(html).not.toContain("lucide-trending-down");
    expect(html).not.toContain("text-success");
    expect(html).not.toContain("text-danger");
  });

  it("treats +0% and -0% as unchanged too", () => {
    for (const delta of ["+0%", "-0%"]) {
      const html = renderToStaticMarkup(<StatCard label="Revenue" value="₦1,000.00" delta={delta} />);
      expect(html).not.toContain("lucide-trending-up");
      expect(html).not.toContain("lucide-trending-down");
      expect(html).toContain("text-muted");
    }
  });

  it("shows a rising delta as success with an up arrow", () => {
    const html = renderToStaticMarkup(<StatCard label="Revenue" value="₦1,000.00" delta="+12%" />);
    expect(html).toContain("text-success");
    expect(html).toContain("lucide-trending-up");
  });

  it("shows a falling delta as danger with a down arrow", () => {
    const html = renderToStaticMarkup(<StatCard label="Revenue" value="₦1,000.00" delta="-3%" />);
    expect(html).toContain("text-danger");
    expect(html).toContain("lucide-trending-down");
  });

  it("flips the tone for metrics where up is bad", () => {
    const html = renderToStaticMarkup(<StatCard label="Expenses" value="₦400.00" delta="+20%" invertDelta />);
    expect(html).toContain("text-danger");
    expect(html).toContain("lucide-trending-up");
  });

  it("flips the tone for falling expenses", () => {
    const html = renderToStaticMarkup(<StatCard label="Expenses" value="₦400.00" delta="-20%" invertDelta />);
    expect(html).toContain("text-success");
    expect(html).toContain("lucide-trending-down");
  });
});
