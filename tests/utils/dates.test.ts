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

  it("formats full ISO timestamps as the Lagos calendar day", () => {
    expect(formatIsoDate("2026-10-20T05:34:12.000Z")).toBe("20 Oct 2026");
    // 23:30 UTC is already the next day in Lagos (UTC+1).
    expect(formatIsoDate("2026-10-31T23:30:00.000Z")).toBe("1 Nov 2026");
    expect(formatIsoDate("not a date")).toBe("not a date");
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
