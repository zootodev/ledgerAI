import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
  LoginForm: vi.fn(() => null as never),
}));

vi.mock("@/lib/auth/server", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

vi.mock("@/components/auth/login-form", () => ({
  LoginForm: mocks.LoginForm,
}));

import LoginPage from "@/app/(auth)/login/page";

const AUTHED = { id: "auth-user-a", email: "a@example.com", name: "User A" };

async function render(error?: string) {
  const element = await LoginPage({
    searchParams: Promise.resolve(error ? { error } : {}),
  });
  return renderToStaticMarkup(element);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue(null);
  mocks.LoginForm.mockImplementation(() => null as never);
});

describe("login page", () => {
  it("redirects an already-signed-in user to /overview", async () => {
    mocks.getCurrentUser.mockResolvedValue(AUTHED);

    await expect(LoginPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      "NEXT_REDIRECT",
    );
    expect(mocks.redirect).toHaveBeenCalledWith("/overview");
  });

  it("renders the sign-in form for signed-out visitors without any error copy", async () => {
    const html = await render();

    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(mocks.LoginForm).toHaveBeenCalledTimes(1);
    expect(html).not.toContain("role=\"alert\"");
  });

  it("surfaces a user-safe message for an auth_failed callback error", async () => {
    const html = await render("auth_failed");

    expect(html).toContain("This link is invalid or has expired");
    expect(html).toContain("/forgot-password");
  });

  it("surfaces a message for a missing confirmation code", async () => {
    const html = await render("missing_code");

    expect(html).toContain("Incomplete sign-in link");
    expect(html).toContain("/forgot-password");
  });

  it("surfaces a message for an unconfigured callback", async () => {
    const html = await render("not_configured");

    // React escapes the apostrophe in server-rendered text.
    expect(html).toContain("Email sign-in isn&#x27;t available right now");
  });

  it("never echoes unknown or raw error values", async () => {
    const html = await render("exchange invalid_grant: raw provider text");

    expect(html).not.toContain("invalid_grant");
    expect(html).not.toContain("raw provider text");
    expect(html).not.toContain("role=\"alert\"");
  });
});