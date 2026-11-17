import { describe, expect, it } from "vitest";
import {
  formatIsoDate,
  formatIsoDateInput,
  parseDisplayDate,
} from "@/lib/utils/dates";

describe("date display helpers", () => {
  it("formats ISO days in en-NG order", () => {
    expect(formatIsoDate("2026-10-01")).toBe("1 Oct 2026");
    expect(formatIsoDateInput("2026-10-01")).toBe("01/10/2026");
  });

  it("parses DD/MM/YYYY into an ISO day", () => {
    expect(parseDisplayDate("01/10/2026")).toBe("2026-10-01");
    expect(parseDisplayDate("1/10/2026")).toBe("2026-10-01");
  });

  it("rejects impossible dates and treats the first number as the day", () => {
    expect(parseDisplayDate("31/02/2026")).toBeNull();
    expect(parseDisplayDate("10/01/2026")).toBe("2026-01-10");
    expect(parseDisplayDate("not a date")).toBeNull();
  });
});
