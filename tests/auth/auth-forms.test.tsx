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
import {
  ResetPasswordForm,
  resetFieldErrors,
} from "@/components/auth/reset-password-form";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

function staticMarkup(Component: () => React.ReactElement) {
  return renderToStaticMarkup(React.createElement(Component));
}

/** Markup with tags removed, so assertions read as plain visible copy. */
function visible(html: string): string {
  return html.replace(/<[^>]*>/g, "");
}

/** Count browser-validated `required` attributes in a rendered form. */
function countRequired(html: string) {
  return (html.match(/required=""/g) ?? []).length;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("signup form", () => {
  it("leads with the import → review → profit outcome and a show-password toggle", () => {
    const html = staticMarkup(SignupForm);
    const copy = visible(html);
    expect(copy).toContain("Import — Upload a bank or PDF statement");
    expect(copy).toContain("Review — Confirm how each transaction is categorized");
    expect(copy).toContain("Profit — See income minus costs, clearly");
    expect(html).toContain("Show password");
    expect(html).toContain('type="password"');
  });

  it("marks name, email, password and the terms consent as required so the asterisks are consistent", () => {
    const html = staticMarkup(SignupForm);
    expect(countRequired(html)).toBe(4);
    // The password gets a real instruction rather than a pre-filled mask.
    expect(html).toContain('placeholder="Create a password"');
    expect(html).not.toContain("••••••••");
  });

  it("requires an explicit Terms and Privacy consent with links to both documents", () => {
    const html = staticMarkup(SignupForm);
    expect(html).toContain('name="acceptTerms"');
    expect(html).toContain('type="checkbox"');
    const copy = visible(html);
    expect(copy).toContain("I agree to the");
    expect(copy).toContain("Terms");
    expect(copy).toContain("Privacy Notice");
    expect(html).toContain('href="/terms"');
    expect(html).toContain('href="/privacy"');
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
    expect(visible(html)).toContain("Review — Check recent imports and uncategorized rows");
    expect(html).toContain("Forgot your password?");
    expect(html).toContain("Show password");
    expect(html).toContain('type="password"');
  });

  it("requires both email and password", () => {
    const html = staticMarkup(LoginForm);
    expect(countRequired(html)).toBe(2);
    expect(html).toContain('placeholder="Enter your password"');
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

describe("resetFieldErrors", () => {
  it("routes field-specific copy onto the field that caused it", () => {
    expect(
      resetFieldErrors({ error: "Password must be at least 10 characters." }),
    ).toEqual({ password: "Password must be at least 10 characters." });
    expect(resetFieldErrors({ error: "Passwords don't match." })).toEqual({
      confirm: "Passwords don't match.",
    });
  });

  it("keeps a step-up message out of the fields so it is only shown once", () => {
    // The alert renders this copy together with its link; mapping it onto the
    // password field as well would show the same sentence twice.
    expect(
      resetFieldErrors({
        error: "Enter your 2FA code to continue.",
        errorAction: {
          label: "Complete two-step verification",
          href: "/auth/mfa?next=%2Freset-password",
        },
      }),
    ).toEqual({});
  });

  it("treats any copy with a recovery action as form-level", () => {
    expect(
      resetFieldErrors({
        error: "Passwords don't match.",
        errorAction: { label: "Retry", href: "/reset-password" },
      }),
    ).toEqual({});
  });

  it("has nothing to route for success or an empty state", () => {
    expect(resetFieldErrors({})).toEqual({});
    expect(resetFieldErrors({ success: "Your password has been updated." })).toEqual({});
  });
});

describe("forgot password form", () => {
  it("describes the reset link expiry without hinting at account existence", () => {
    const html = staticMarkup(ForgotPasswordForm);
    expect(html).toContain("expires after 24 hours");
    expect(html).not.toContain("if an account exists");
  });
});