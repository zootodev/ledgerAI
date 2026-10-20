import { describe, expect, it, vi, beforeEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const mocks = vi.hoisted(() => ({
  ensureOnboarding: vi.fn(),
  requireAuthContext: vi.fn(),
  listAccounts: vi.fn(),
  listCategories: vi.fn(),
  listImportHistory: vi.fn(),
  reportHandledError: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("@/lib/services/auth", () => ({ ensureOnboarding: mocks.ensureOnboarding }));

vi.mock("@/lib/services/auth-context", () => {
  class AuthorizationError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "AuthorizationError";
    }
  }
  return { requireAuthContext: mocks.requireAuthContext, AuthorizationError };
});

vi.mock("@/lib/services", () => ({
  listAccounts: mocks.listAccounts,
  listCategories: mocks.listCategories,
  listImportHistory: mocks.listImportHistory,
}));

vi.mock("@/lib/auth/actions", () => ({ signOutAction: vi.fn() }));

vi.mock("@/lib/observability/server-report", () => ({
  reportHandledError: mocks.reportHandledError,
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

// Isolate the page's branch logic from the heavy child trees.
vi.mock("@/components/import/import-wizard", () => ({
  ImportWizard: () => createElement("div", null, "WIZARD"),
}));
vi.mock("@/components/import/import-load-error", () => ({
  ImportLoadError: () => createElement("div", null, "LOAD_ERROR"),
}));

import ImportPage from "@/app/import/page";
import { AuthorizationError } from "@/lib/services/auth-context";

const SESSION = {
  user: { name: "Ada", email: "ada@example.com" },
  business: { id: "biz-a", name: "Acme", currency: "NGN" },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.ensureOnboarding.mockResolvedValue(undefined);
  mocks.requireAuthContext.mockResolvedValue(SESSION);
  mocks.listAccounts.mockResolvedValue([]);
  mocks.listCategories.mockResolvedValue([]);
  mocks.listImportHistory.mockResolvedValue([]);
  mocks.redirect.mockImplementation(() => {
    throw Object.assign(new Error("NEXT_REDIRECT"), {
      digest: "NEXT_REDIRECT;replace;/login;307;",
    });
  });
});

function nextRedirect() {
  return Object.assign(new Error("NEXT_REDIRECT"), {
    digest: "NEXT_REDIRECT;replace;/onboarding;307;",
  });
}

describe("ImportPage — resilient data loading", () => {
  it("renders the wizard when every lookup succeeds", async () => {
    const html = renderToStaticMarkup(await ImportPage());
    expect(html).toContain("WIZARD");
    expect(mocks.reportHandledError).not.toHaveBeenCalled();
  });

  it("retries a transient data-load failure once, then renders the wizard", async () => {
    mocks.listAccounts
      .mockRejectedValueOnce({
        message:
          "(EMAXCONNSESSION) max clients reached in session mode - max clients are limited to pool_size: 15",
      })
      .mockResolvedValueOnce([]);

    const html = renderToStaticMarkup(await ImportPage());

    expect(html).toContain("WIZARD");
    expect(mocks.listAccounts).toHaveBeenCalledTimes(2);
    expect(mocks.reportHandledError).not.toHaveBeenCalled();
  });

  it("renders an inline retry (not the global error page) when a lookup fails", async () => {
    const error = new Error("connection pool exhausted");
    mocks.listAccounts.mockRejectedValue(error);

    const html = renderToStaticMarkup(await ImportPage());

    expect(html).toContain("LOAD_ERROR");
    expect(mocks.reportHandledError).toHaveBeenCalledWith("import.load.data", error);
  });

  it("renders the inline retry when the business lookup fails after retrying", async () => {
    const error = { code: "P1017" };
    mocks.requireAuthContext.mockRejectedValue(error);

    const html = renderToStaticMarkup(await ImportPage());

    expect(html).toContain("LOAD_ERROR");
    expect(mocks.reportHandledError).toHaveBeenCalledWith("import.load.context", error);
  });

  it("still redirects to /login when the session is simply missing", async () => {
    mocks.requireAuthContext.mockRejectedValue(new AuthorizationError("You must be signed in."));

    await expect(ImportPage()).rejects.toMatchObject({
      digest: expect.stringContaining("NEXT_REDIRECT"),
    });
    expect(mocks.redirect).toHaveBeenCalledWith("/login");
    expect(mocks.reportHandledError).not.toHaveBeenCalled();
  });

  it("does not swallow an onboarding redirect", async () => {
    const redirectError = nextRedirect();
    mocks.ensureOnboarding.mockRejectedValue(redirectError);

    await expect(ImportPage()).rejects.toBe(redirectError);
    expect(mocks.reportHandledError).not.toHaveBeenCalled();
  });
});
