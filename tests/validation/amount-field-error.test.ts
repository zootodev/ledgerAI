import { describe, expect, it } from "vitest";
import { amountFieldError } from "@/lib/validation/transaction";

describe("amountFieldError (inline amount feedback)", () => {
  it("accepts a plain decimal amount", () => {
    expect(amountFieldError("2500")).toBeUndefined();
    expect(amountFieldError("2500.00")).toBeUndefined();
    expect(amountFieldError("  49.99  ")).toBeUndefined();
  });

  it("rejects every numeric zero variant with a positive-amount message", () => {
    for (const zero of ["0", "0.0", "0.00", "00", "000.00"]) {
      expect(amountFieldError(zero)).toBe("Enter a positive amount");
    }
  });

  it("rejects negative, non-numeric and over-precise values", () => {
    for (const bad of ["", "   ", "-5", "abc", "1.234", "1,000", "NaN"]) {
      expect(amountFieldError(bad)).toBe("Enter a positive amount");
    }
  });
});
