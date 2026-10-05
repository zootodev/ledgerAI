import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
  ForgotPasswordForm: vi.fn(() => null as never),
  ResetPasswordForm: vi.fn(() => null as never),
}));

vi.mock("@/lib/auth/server", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

vi.mock("@/components/auth/forgot-password-form", () => ({
  ForgotPasswordForm: mocks.ForgotPasswordForm,
}));

vi.mock("@/components/auth/reset-password-form", () => ({
  ResetPasswordForm: mocks.ResetPasswordForm,
}));

import ForgotPasswordPage from "@/app/(auth)/forgot-password/page";
import ResetPasswordPage from "@/app/(auth)/reset-password/page";

const AUTHED = { id: "auth-user-a", email: "a@example.com", name: "User A" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.ForgotPasswordForm.mockImplementation(() => null as never);
  mocks.ResetPasswordForm.mockImplementation(() => null as never);
});

describe("forgot-password page", () => {
  it("redirects an already-signed-in user away (no reset misuse while authed)", async () => {
    mocks.getCurrentUser.mockResolvedValue(AUTHED);

    await expect(ForgotPasswordPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith("/overview");
    expect(mocks.ForgotPasswordForm).not.toHaveBeenCalled();
  });

  it("renders the reset-request form for signed-out visitors", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);

    const element = await ForgotPasswordPage();
    renderToStaticMarkup(element);

    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(mocks.ForgotPasswordForm).toHaveBeenCalledTimes(1);
  });
});

describe("reset-password page", () => {
  it("locks the new-password form behind the recovery session", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);

    await expect(ResetPasswordPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith("/login");
    expect(mocks.ResetPasswordForm).not.toHaveBeenCalled();
  });

  it("renders the new-password form only for a validated recovery session", async () => {
    mocks.getCurrentUser.mockResolvedValue(AUTHED);

    const element = await ResetPasswordPage();
    renderToStaticMarkup(element);

    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(mocks.ResetPasswordForm).toHaveBeenCalledTimes(1);
  });
});