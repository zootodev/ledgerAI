import { describe, expect, it } from "vitest";
import { compactCurrency } from "@/components/charts/shared";

describe("compactCurrency", () => {
  it("formats compact currency values in en-NG style with lowercase magnitude", () => {
    expect(compactCurrency(200_000, "NGN")).toBe("₦200k");
    expect(compactCurrency(1_500_000, "NGN")).toBe("₦1.5m");
  });

  it("handles zero and fractional amounts", () => {
    expect(compactCurrency(0, "NGN")).toBe("₦0");
    expect(compactCurrency(500_000, "GHS")).toContain("k");
  });

  it("renders magnitude suffix in lowercase", () => {
    const out = compactCurrency(999_999, "NGN");
    expect(out.toLowerCase()).toMatch(/[km]$/);
  });
});
