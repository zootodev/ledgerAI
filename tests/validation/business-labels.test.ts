import { describe, expect, it } from "vitest";
import { COUNTRIES, COUNTRY_LABELS } from "@/lib/validation/business";

describe("COUNTRY_LABELS", () => {
  it("provides a human-readable label for every supported country code", () => {
    for (const code of COUNTRIES) {
      expect(COUNTRY_LABELS[code]).toBeTruthy();
    }
    expect(Object.keys(COUNTRY_LABELS)).toHaveLength(COUNTRIES.length);
  });

  it("labels the canonical codes with their common display names", () => {
    expect(COUNTRY_LABELS.NG).toBe("Nigeria");
    expect(COUNTRY_LABELS.GB).toBe("United Kingdom");
    expect(COUNTRY_LABELS.ZA).toBe("South Africa");
  });
});