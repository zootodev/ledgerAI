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

  it("shows a rising delta as success", () => {
    const html = renderToStaticMarkup(<StatCard label="Revenue" value="₦1,000.00" delta="+12%" />);
    expect(html).toContain("text-success-strong");
    expect(html).toContain("+12%");
  });

  it("shows a falling delta as danger", () => {
    const html = renderToStaticMarkup(<StatCard label="Revenue" value="₦1,000.00" delta="-3%" />);
    expect(html).toContain("text-danger-strong");
    expect(html).toContain("-3%");
  });

  it("flips the tone for metrics where up is bad", () => {
    const html = renderToStaticMarkup(<StatCard label="Expenses" value="₦400.00" delta="+20%" invertDelta />);
    expect(html).toContain("text-danger-strong");
    expect(html).toContain("+20%");
  });

  it("flips the tone for falling expenses", () => {
    const html = renderToStaticMarkup(<StatCard label="Expenses" value="₦400.00" delta="-20%" invertDelta />);
    expect(html).toContain("text-success-strong");
    expect(html).toContain("-20%");
  });

  it("renders a No change label neutrally, with no percent sign", () => {
    const html = renderToStaticMarkup(<StatCard label="Revenue" value="₦0.00" delta="No change" />);
    expect(html).toContain(">No change<");
    expect(html).toContain("text-muted");
    expect(html).not.toContain("No change%");
    expect(html).not.toContain("text-success-strong");
    expect(html).not.toContain("text-danger-strong");
  });

  it("renders a New label neutrally, without appending a percent sign", () => {
    const html = renderToStaticMarkup(<StatCard label="Revenue" value="₦1,000.00" delta="New" />);
    expect(html).toContain(">New<");
    expect(html).not.toContain("New%");
    expect(html).toContain("text-muted");
    expect(html).not.toContain("lucide-trending-up");
    expect(html).not.toContain("text-success");
  });
});
