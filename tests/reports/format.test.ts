import { describe, expect, it, vi } from "vitest";

// mocks needed because @/lib/services/reports pulls in the DB client module
// graph at import time.
vi.mock("@/lib/auth/server", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ getPrismaClient: vi.fn() }));
vi.mock("@/generated/prisma/client", () => ({ PrismaClient: class {} }));

import {
  monthBounds,
  reportPeriodLabel,
  slugAccountName,
} from "@/lib/services/reports";

describe("reportPeriodLabel", () => {
  it("labels an open-ended window as all time", () => {
    expect(reportPeriodLabel({ from: null, to: null })).toBe("All time");
  });

  it("formats a fully bounded window with both dates", () => {
    expect(reportPeriodLabel({ from: "2026-06-01", to: "2026-06-30" })).toBe(
      "1 Jun 2026 – 30 Jun 2026",
    );
  });

  it("prefixes half-open windows with a direction", () => {
    expect(reportPeriodLabel({ from: "2026-06-01", to: null })).toBe(
      "From 1 Jun 2026",
    );
    expect(reportPeriodLabel({ from: null, to: "2026-06-30" })).toBe(
      "Up to 30 Jun 2026",
    );
  });
});

describe("monthBounds", () => {
  it("returns inclusive first/last dates for a month bucket key", () => {
    expect(monthBounds("2026-02")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(monthBounds("2026-12")).toEqual({ from: "2026-12-01", to: "2026-12-31" });
  });

  it("respects leap years", () => {
    expect(monthBounds("2024-02")).toEqual({ from: "2024-02-01", to: "2024-02-29" });
  });
});

describe("slugAccountName", () => {
  it("slugifies an account name for a safe CSV filename", () => {
    expect(slugAccountName("Main Account")).toBe("main-account");
    expect(slugAccountName("OPay (USD)")).toBe("opay-usd");
    expect(slugAccountName("")).toBe("account");
  });
});