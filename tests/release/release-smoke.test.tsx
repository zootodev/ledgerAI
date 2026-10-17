// ============================================================
// LedgerAI — Release smoke coverage (Phase 6)
// ------------------------------------------------------------
// One route/component-level suite that walks the essential
// production journeys end-to-end through the REAL page and route
// modules (no browser/E2E framework needed):
//
//   1. unauthenticated protected-route redirect
//   2. sign-in / sign-up shells + onboarding completion path
//   3. import draft expiry and safe resume
//   4. reports account filter (valid / invalid / foreign)
//   5. CSV export preserves range + account scope
//   6. authenticated /ask and /ask-v2 404 instead of redirecting
//   7. signed-out /ask follows ordinary login protection
//
// It complements the focused unit suites; where a journey is also
// covered in depth there, this file asserts the integrated contract.
// ============================================================

import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  ensureOnboarding: vi.fn(),
  requireAuthContext: vi.fn(),
  getCurrentUser: vi.fn(),
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  listAccounts: vi.fn(),
  listTransactions: vi.fn(),
  listCategories: vi.fn(),
  listImportHistory: vi.fn(),
  getAnalyticsSummary: vi.fn(),
  getAnalyticsTrends: vi.fn(),
  getBusinessProfile: vi.fn(),
  getReportData: vi.fn(),
  getAppBaseUrl: vi.fn(),
  consumeConfiguredLimit: vi.fn(),
}));

vi.mock("@/lib/services/auth", () => ({ ensureOnboarding: mocks.ensureOnboarding }));
vi.mock("@/lib/services/auth-context", () => ({
  requireAuthContext: mocks.requireAuthContext,
  AuthorizationError: class AuthorizationError extends Error {},
}));
vi.mock("@/lib/auth/server", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/services", () => ({
  listAccounts: mocks.listAccounts,
  listTransactions: mocks.listTransactions,
  listCategories: mocks.listCategories,
  listImportHistory: mocks.listImportHistory,
  getAnalyticsSummary: mocks.getAnalyticsSummary,
  getAnalyticsTrends: mocks.getAnalyticsTrends,
}));
vi.mock("@/lib/services/business", () => ({ getBusinessProfile: mocks.getBusinessProfile }));
vi.mock("@/lib/services/reports", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/reports")>();
  return { ...actual, getReportData: mocks.getReportData };
});
vi.mock("@/lib/auth/app-url", () => ({ getAppBaseUrl: mocks.getAppBaseUrl }));
vi.mock("@/lib/security/rate-limit", () => ({
  consumeConfiguredLimit: mocks.consumeConfiguredLimit,
  RATE_LIMIT_EXCEEDED_MESSAGE: "Too many requests. Please slow down and try again shortly.",
}));
vi.mock("@/lib/db/client", () => ({ getPrismaClient: vi.fn() }));
vi.mock("@/generated/prisma/client", () => ({ PrismaClient: class {} }));
vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
  notFound: mocks.notFound,
}));
// Render only the auth page shells, not the interactive forms.
vi.mock("@/components/auth/login-form", () => ({ LoginForm: () => null }));
vi.mock("@/components/auth/signup-form", () => ({ SignupForm: () => null }));

import { isPublicPath } from "@/proxy";
import OverviewPage from "@/app/overview/page";
import ReportsPage from "@/app/reports/page";
import TransactionsPage from "@/app/transactions/page";
import InsightsPage from "@/app/insights/page";
import ImportPage from "@/app/import/page";
import AskPage from "@/app/ask/page";
import AskV2Page from "@/app/ask-v2/page";
import LoginPage from "@/app/(auth)/login/page";
import SignupPage from "@/app/(auth)/signup/page";
import OnboardingPage from "@/app/onboarding/page";
import { GET as exportReport } from "@/app/reports/export/route";
import {
  IMPORT_DRAFT_TTL_MS,
  parseDraft,
  serializeDraft,
  type ImportDraft,
} from "@/lib/import/draft";

const OWNED = "11111111-1111-4111-8111-111111111111";
const FOREIGN = "99999999-9999-4999-8999-999999999999";

const SESSION = {
  user: { id: "user-1", name: "Ada Lovelace", email: "ada@example.com" },
  business: { id: "biz-1", name: "Acme Studio", currency: "GBP" },
  prisma: {
    account: { findFirst: vi.fn() },
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.ensureOnboarding.mockResolvedValue({ id: "user-1", email: "ada@example.com" });
  mocks.requireAuthContext.mockResolvedValue(SESSION);
  mocks.getCurrentUser.mockResolvedValue(null);
  mocks.listAccounts.mockResolvedValue([{ id: OWNED, name: "Main account" }]);
  mocks.listTransactions.mockResolvedValue({
    items: [],
    total: 0,
    page: 1,
    pageSize: 20,
    pages: 1,
  });
  mocks.listCategories.mockResolvedValue([]);
  mocks.listImportHistory.mockResolvedValue([]);
  mocks.getAnalyticsSummary.mockResolvedValue({});
  mocks.getAnalyticsTrends.mockResolvedValue({ points: [], period: { from: null, to: null } });
  mocks.getBusinessProfile.mockResolvedValue({
    name: "Acme Studio",
    country: "GB",
    currency: "GBP",
    type: "Retail",
  });
  mocks.getReportData.mockResolvedValue({
    summary: {
      revenue: 0,
      expenses: 0,
      transfers: 0,
      netProfit: 0,
      profitMargin: null,
      cashBalance: 0,
      period: { from: null, to: null },
      prior: null,
      hasAnyTransactions: false,
    },
    monthly: { points: [], period: { from: null, to: null } },
    category: { income: 0, expenses: 0, rows: [] },
    income: { total: 0, rows: [] },
    expense: { total: 0, rows: [] },
    profit: {
      revenue: 0,
      expenses: 0,
      netProfit: 0,
      profitMargin: null,
      period: { from: null, to: null },
      prior: null,
    },
  });
  mocks.getAppBaseUrl.mockResolvedValue("http://localhost:3000");
  mocks.consumeConfiguredLimit.mockResolvedValue({
    ok: true,
    remaining: 10,
    retryAfterSeconds: 0,
  });
  SESSION.prisma.account.findFirst.mockResolvedValue({ name: "Main account" });
});

/* ------------------------------------------------------------------ */
/* 1. Unauthenticated protected-route redirect                        */
/* ------------------------------------------------------------------ */
describe("journey 1 — protected routes require a session", () => {
  const protectedRoutes: Array<[string, () => Promise<unknown>]> = [
    ["/overview", () => OverviewPage({ searchParams: Promise.resolve({}) })],
    ["/reports", () => ReportsPage({ searchParams: Promise.resolve({}) })],
    ["/transactions", () => TransactionsPage({ searchParams: Promise.resolve({}) })],
    ["/insights", () => InsightsPage({ searchParams: Promise.resolve({}) })],
    ["/import", () => ImportPage()],
  ];

  for (const [route, run] of protectedRoutes) {
    it(`redirects anonymous visitors of ${route} to /login`, async () => {
      mocks.requireAuthContext.mockRejectedValue(new Error("You must be signed in."));

      await expect(run()).rejects.toThrow("NEXT_REDIRECT");
      expect(mocks.redirect).toHaveBeenCalledWith("/login");
    });
  }

  it("keeps every app route out of the proxy's public allow-list", () => {
    for (const path of [
      "/overview",
      "/reports",
      "/transactions",
      "/insights",
      "/import",
      "/settings",
      "/ask",
      "/ask-v2",
    ]) {
      expect(isPublicPath(path)).toBe(false);
    }
  });
});

/* ------------------------------------------------------------------ */
/* 2. Auth shells + onboarding completion path                        */
/* ------------------------------------------------------------------ */
describe("journey 2 — auth shells and onboarding completion", () => {
  it("renders the sign-in and sign-up shells for signed-out visitors", async () => {
    const login = await LoginPage({ searchParams: Promise.resolve({}) });
    expect(login).toBeDefined();

    const signup = await SignupPage();
    expect(signup).toBeDefined();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("sends a finished profile away from /onboarding to the dashboard", async () => {
    await expect(OnboardingPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith("/overview");
  });

  it("keeps an unfinished profile on the onboarding form", async () => {
    mocks.getBusinessProfile.mockResolvedValue({
      name: "Acme Studio",
      country: "GB",
      currency: "GBP",
      type: null,
    });

    const element = await OnboardingPage();
    expect(element).toBeDefined();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------------ */
/* 3. Import draft expiry + safe resume                               */
/* ------------------------------------------------------------------ */
describe("journey 3 — import draft retention", () => {
  function draft(savedAtMs: number): ImportDraft {
    return {
      v: 1,
      fileName: "statement.csv",
      fileSize: 128,
      fileLastModified: 1,
      fileType: "csv",
      mapping: { date: "Date", amount: "Amount" },
      accountId: "",
      step: 2,
      selections: { "0": true },
      overrides: {},
      savedAt: new Date(savedAtMs).toISOString(),
    };
  }

  it("resumes a draft saved within the 24h window", () => {
    const now = Date.UTC(2026, 5, 1, 12, 0, 0);
    const parsed = parseDraft(serializeDraft(draft(now - 60 * 60 * 1000)), now);
    expect(parsed).not.toBeNull();
    expect(parsed?.fileName).toBe("statement.csv");
  });

  it("treats an expired draft as absent so the wizard resumes cleanly", () => {
    const now = Date.UTC(2026, 5, 1, 12, 0, 0);
    const parsed = parseDraft(serializeDraft(draft(now - IMPORT_DRAFT_TTL_MS - 1)), now);
    expect(parsed).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* 4. Reports account filter                                          */
/* ------------------------------------------------------------------ */
describe("journey 4 — reports account filter", () => {
  it("renders for an owned account", async () => {
    const element = await ReportsPage({ searchParams: Promise.resolve({ accountId: OWNED }) });
    expect(element).toBeDefined();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("drops a malformed account id (safe redirect preserving the range)", async () => {
    await expect(
      ReportsPage({
        searchParams: Promise.resolve({ from: "2026-09-01", accountId: "not-a-uuid" }),
      }),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith("/reports?from=2026-09-01");
  });

  it("drops a foreign account id instead of showing an empty report", async () => {
    await expect(
      ReportsPage({
        searchParams: Promise.resolve({ from: "2026-09-01", to: "2026-09-30", accountId: FOREIGN }),
      }),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith("/reports?from=2026-09-01&to=2026-09-30");
  });
});

/* ------------------------------------------------------------------ */
/* 5. CSV export preserves range + account scope                      */
/* ------------------------------------------------------------------ */
describe("journey 5 — CSV export scope", () => {
  it("preserves the selected range and account in the query + filename", async () => {
    const response = await exportReport(
      new Request(
        "http://localhost:3000/reports/export?type=summary&from=2026-01-01&to=2026-01-31&accountId=" +
          OWNED,
      ),
    );

    expect(response.status).toBe(200);
    expect(mocks.getReportData).toHaveBeenCalledWith({
      dateFrom: "2026-01-01",
      dateTo: "2026-01-31",
      accountId: OWNED,
    });
    expect(response.headers.get("content-disposition")).toContain("main-account");
  });

  it("rejects a foreign account id at the export boundary", async () => {
    SESSION.prisma.account.findFirst.mockResolvedValue(null);

    const response = await exportReport(
      new Request(`http://localhost:3000/reports/export?type=summary&accountId=${FOREIGN}`),
    );

    expect(response.status).toBe(400);
    expect(mocks.getReportData).not.toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------------ */
/* 6 + 7. Ask is hidden                                           */
/* ------------------------------------------------------------------ */
describe("journeys 6 & 7 — Ask stays hidden and normally protected", () => {
  const askRoutes: Array<[string, () => Promise<unknown>]> = [
    ["/ask", () => AskPage()],
    ["/ask-v2", () => AskV2Page()],
  ];

  for (const [route, run] of askRoutes) {
    it(`404s an authenticated ${route} visit instead of redirecting to the app`, async () => {
      await expect(run()).rejects.toThrow("NEXT_NOT_FOUND");
      expect(mocks.notFound).toHaveBeenCalled();
      expect(mocks.redirect).not.toHaveBeenCalled();
    });

    it(`sends a signed-out ${route} visit to /login`, async () => {
      mocks.requireAuthContext.mockRejectedValue(new Error("You must be signed in."));
      await expect(run()).rejects.toThrow("NEXT_REDIRECT");
      expect(mocks.redirect).toHaveBeenCalledWith("/login");
    });
  }
});
