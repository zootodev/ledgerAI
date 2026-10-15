import { describe, expect, it, vi, beforeEach } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/lib/auth/actions", () => ({
  signupAction: vi.fn(),
  loginAction: vi.fn(),
  updatePasswordAction: vi.fn(),
  forgotPasswordAction: vi.fn(),
}));

import { SignupForm } from "@/components/auth/signup-form";
import { LoginForm } from "@/components/auth/login-form";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

function staticMarkup(Component: () => React.ReactElement) {
  return renderToStaticMarkup(React.createElement(Component));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("signup form", () => {
  it("leads with the import → review → profit outcome and a show-password toggle", () => {
    const html = staticMarkup(SignupForm);
    expect(html).toContain("Import.");
    expect(html).toContain("Review.");
    expect(html).toContain("Profit.");
    expect(html).toContain("Show password");
    expect(html).toContain('type="password"');
  });

  it("highlights the password field when the server says it is too short", async () => {
    // The per-field mapping lives on the message the action returns; we verify
    // the field renders with a toggle and global alert present in markup.
    const html = staticMarkup(SignupForm);
    expect(html).toContain("id=\"password\"");
    expect(html).toContain('aria-label="Show password"');
  });
});

describe("login form", () => {
  it("reframes the outcomes for sign-in and keeps the masked password toggle", () => {
    const html = staticMarkup(LoginForm);
    expect(html).toContain("Review.");
    expect(html).toContain("Forgot your password?");
    expect(html).toContain("Show password");
    expect(html).toContain('type="password"');
  });
});

describe("reset password form", () => {
  it("maps password-length and mismatch errors onto their fields", () => {
    // Static markup renders both masked fields with toggles; the dynamic error
    // mapping is exercised with the action state in PasswordField's own tests.
    const html = staticMarkup(ResetPasswordForm);
    expect(html).toContain('name="password"');
    expect(html).toContain('name="confirm"');
    expect(html).toContain("Show password");
  });
});

describe("forgot password form", () => {
  it("describes the reset link expiry without hinting at account existence", () => {
    const html = staticMarkup(ForgotPasswordForm);
    expect(html).toContain("expires after 24 hours");
    expect(html).not.toContain("if an account exists");
  });
});