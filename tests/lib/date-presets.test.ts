import { describe, expect, it } from "vitest";
import { resolvePresetRange } from "@/lib/date-presets";

describe("resolvePresetRange", () => {
  it("computes ranges from the day it is called, not module load", () => {
    expect(resolvePresetRange("last30", new Date(2026, 10, 18))).toEqual({
      dateFrom: "2026-10-20",
      dateTo: "2026-11-18",
    });
    expect(resolvePresetRange("last30", new Date(2026, 11, 1))).toEqual({
      dateFrom: "2026-11-02",
      dateTo: "2026-12-01",
    });
  });

  it("returns undefined for all, unknown or inherited keys", () => {
    expect(resolvePresetRange("all")).toBeUndefined();
    expect(resolvePresetRange("nope")).toBeUndefined();
    expect(resolvePresetRange("toString")).toBeUndefined();
  });
});
