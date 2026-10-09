import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ReportData } from "@/lib/services/reports";

vi.mock("@/lib/services/auth-context", () => ({
  requireAuthContext: vi.fn(),
}));

vi.mock("@/lib/auth/app-url", () => ({
  getAppBaseUrl: vi.fn(),
}));

vi.mock("@/lib/services/reports", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/reports")>();
  return { ...actual, getReportData: vi.fn() };
});

const rateLimitMocks = vi.hoisted(() => ({
  consumeConfiguredLimit: vi.fn(async () => ({ ok: true, remaining: 10, retryAfterSeconds: 0 })),
}));

vi.mock("@/lib/security/rate-limit", () => ({
  ...rateLimitMocks,
  RATE_LIMIT_EXCEEDED_MESSAGE: "Too many requests. Please slow down and try again shortly.",
}));

import { requireAuthContext } from "@/lib/services/auth-context";
import { getAppBaseUrl } from "@/lib/auth/app-url";
import { getReportData } from "@/lib/services/reports";
import { GET } from "@/app/reports/export/route";

const reportData: ReportData = {
  summary: {
    revenue: 12000.5,
    expenses: 8000,
    transfers: 0,
    netProfit: 4000.5,
    profitMargin: 33.38,
    cashBalance: 5000.5,
    period: { from: "2026-01-01", to: "2026-01-31" },
  },
  monthly: { points: [], period: { from: null, to: null } },
  category: { income: 0, expenses: 0, rows: [] },
};

function exportRequest(query = "type=summary") {
  return new Request(`http://localhost:3000/reports/export?${query}`);
}

function csvResponse(request: Request): Promise<{
  status: number;
  type: string;
  disposition: string;
  body: string;
}> {
  return GET(request).then(async (response) => ({
    status: response.status,
    type: response.headers.get("content-type") ?? "",
    disposition: response.headers.get("content-disposition") ?? "",
    body: await response.text(),
  }));
}

beforeEach(() => {
  vi.resetAllMocks();
  rateLimitMocks.consumeConfiguredLimit.mockResolvedValue({
    ok: true,
    remaining: 10,
    retryAfterSeconds: 0,
  });
  vi.mocked(getAppBaseUrl).mockResolvedValue("http://localhost:3000");
  vi.mocked(requireAuthContext).mockResolvedValue({
    user: { id: "auth-user-a", email: "a@example.com" },
    business: { id: "biz-a", name: "A Ltd", currency: "GBP" },
    prisma: {} as never,
  });
  vi.mocked(getReportData).mockResolvedValue(reportData);
});

describe("reports/export route", () => {
  it("downloads the summary report as a CSV attachment", async () => {
    const result = await csvResponse(
      exportRequest("type=summary&from=2026-01-01&to=2026-01-31"),
    );

    expect(result.status).toBe(200);
    expect(result.type).toContain("text/csv");
    expect(result.disposition).toBe(
      'attachment; filename="ledgerai-report-summary-2026-01-01-2026-01-31.csv"',
    );
    expect(result.body.split("\r\n")[0]).toBe("Metric,Value");
    expect(result.body).toContain("Revenue,12000.50");
    expect(getReportData).toHaveBeenCalledWith({
      dateFrom: "2026-01-01",
      dateTo: "2026-01-31",
    });
  });

  it("downloads the monthly report", async () => {
    const result = await csvResponse(
      exportRequest("type=monthly&from=2026-01-01&to=2026-01-31"),
    );

    expect(result.status).toBe(200);
    expect(result.disposition).toBe(
      'attachment; filename="ledgerai-report-monthly-2026-01-01-2026-01-31.csv"',
    );
    expect(result.body.split("\r\n")[0]).toBe(
      "Month,Revenue,Expenses,Transfers,Net profit,Profit margin (%)",
    );
  });

  it("downloads the category report", async () => {
    const result = await csvResponse(exportRequest("type=category"));

    expect(result.status).toBe(200);
    expect(result.disposition).toBe(
      'attachment; filename="ledgerai-report-category-all-all.csv"',
    );
    expect(result.body.split("\r\n")[0]).toBe("Type,Category,Amount,% of type");
  });

  it("rejects an unknown report type", async () => {
    const response = await GET(exportRequest("type=income"));

    expect(response.status).toBe(400);
    expect(getReportData).not.toHaveBeenCalled();
  });

  it("rejects an invalid or unordered date range", async () => {
    const fromAfterTo = await GET(
      exportRequest("type=summary&from=2026-02-01&to=2026-01-31"),
    );
    expect(fromAfterTo.status).toBe(400);

    const malformed = await GET(
      exportRequest("type=summary&from=15/01/2026"),
    );
    expect(malformed.status).toBe(400);
    expect(getReportData).not.toHaveBeenCalled();
  });

  it("redirects to the sign-in page when unauthenticated", async () => {
    vi.mocked(requireAuthContext).mockRejectedValue(new Error("unauth"));

    const response = await GET(exportRequest("type=summary"));

    expect(response.status).toBeGreaterThanOrEqual(300);
    expect(response.status).toBeLessThanOrEqual(308);
    expect(response.headers.get("location")).toBe("http://localhost:3000/login");
    expect(getReportData).not.toHaveBeenCalled();
  });

  it("rejects with HTTP 429 and a Retry-After header when throttled", async () => {
    rateLimitMocks.consumeConfiguredLimit.mockResolvedValue({
      ok: false,
      remaining: 0,
      retryAfterSeconds: 17,
    });

    const response = await GET(exportRequest("type=summary"));

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("17");
    expect(getReportData).not.toHaveBeenCalled();
  });
});