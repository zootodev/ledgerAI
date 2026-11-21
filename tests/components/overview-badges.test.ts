import { describe, expect, it } from "vitest";
import { changeBadge, priorPeriodLabel } from "@/components/dashboard/kpi-grid";

const COMPARISON = "previous 90 days";

describe("changeBadge", () => {
  it("shows a positive percentage with its comparison window", () => {
    const badge = changeBadge(680_000, 400_000, "NGN", { comparison: COMPARISON });
    expect(badge?.label).toBe(`+70% vs ${COMPARISON}`);
    expect(badge?.detail).toBe("was ₦400,000.00");
  });

  it("shows a negative percentage with the prior figure", () => {
    const badge = changeBadge(400, 500, "NGN", { comparison: COMPARISON });
    expect(badge?.label).toBe(`-20% vs ${COMPARISON}`);
    expect(badge?.detail).toBe("was ₦500.00");
  });

  it("says New when the prior was zero", () => {
    expect(changeBadge(1_000, 0, "NGN", { comparison: COMPARISON })?.label).toBe("New");
  });

  it("says No change when both periods are zero, never -100%", () => {
    const badge = changeBadge(0, 0, "NGN", { comparison: COMPARISON });
    expect(badge?.label).toBe("No change");
    expect(badge?.label).not.toContain("100%");
    expect(changeBadge(0, 500, "NGN", { comparison: COMPARISON })?.label).toBe(
      `-100% vs ${COMPARISON}`,
    );
  });

  it("uses plain words when the prior profit was negative", () => {
    const badge = changeBadge(3_000, -12_000, "NGN", {
      comparison: COMPARISON,
      kind: "profit",
    });
    expect(badge?.label).toMatch(/^Up from .*12,000/);
    expect(badge?.label).not.toContain("%");
  });

  it("uses plain words when the sign flips from positive to negative", () => {
    const badge = changeBadge(-3_000, 3_000, "NGN", {
      comparison: COMPARISON,
      kind: "profit",
    });
    expect(badge?.label).toBe("Down from ₦3,000.00");
  });

  it("keeps a percentage above 100% instead of a naira difference", () => {
    const badge = changeBadge(100_000, 10_000, "NGN", { comparison: COMPARISON });
    expect(badge?.label).toBe(`+900% vs ${COMPARISON}`);
    expect(badge?.label).not.toContain("₦");
  });

  it("returns null when there is no comparison window", () => {
    expect(changeBadge(100, undefined, "NGN")).toBeNull();
    expect(changeBadge(100, null, "NGN")).toBeNull();
  });
});

describe("priorPeriodLabel", () => {
  it("names the selected 90-day and 30-day windows", () => {
    expect(
      priorPeriodLabel({ from: "2026-08-24", to: "2026-11-21" }),
    ).toBe("previous 90 days");
    expect(
      priorPeriodLabel({ from: "2026-10-23", to: "2026-11-21" }),
    ).toBe("previous 30 days");
  });

  it("names a whole calendar month as last month", () => {
    expect(
      priorPeriodLabel({ from: "2026-02-01", to: "2026-02-28" }),
    ).toBe("last month");
  });
});
