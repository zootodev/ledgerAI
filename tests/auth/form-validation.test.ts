import { describe, expect, it, vi } from "vitest";
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
import {
  PASSWORD_MIN_LENGTH,
  hasAcceptedTerms,
  validateConfirmPassword,
  validateCurrentPassword,
  validateEmail,
  validateFields,
  validateName,
  validateNewPassword,
  validateTerms,
} from "@/lib/auth/form-validation";

function formData(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
}

function staticMarkup(Component: () => React.ReactElement) {
  return renderToStaticMarkup(React.createElement(Component));
}

describe("email validation", () => {
  it("asks for an address when the field is empty", () => {
    expect(validateEmail("")).toBe("Enter your email address.");
    expect(validateEmail("   ")).toBe("Enter your email address.");
  });

  it("flags obvious typos but accepts normal addresses", () => {
    expect(validateEmail("not-an-email")).toMatch(/valid email/i);
    expect(validateEmail("ngozi@")).toMatch(/valid email/i);
    expect(validateEmail("ngozi@example.com")).toBeUndefined();
    expect(validateEmail("  ngozi@example.com  ")).toBeUndefined();
  });
});

describe("new password validation", () => {
  it("uses the 10-character policy shared with signup", () => {
    expect(PASSWORD_MIN_LENGTH).toBe(10);
    expect(validateNewPassword("")).toBeDefined();
    expect(validateNewPassword("short")).toBe("Use at least 10 characters.");
    expect(validateNewPassword("longenough1")).toBeUndefined();
  });
});

describe("sign-in password validation stays lenient", () => {
  it("only checks presence so legacy short passwords still sign in", () => {
    // Accounts created before the current policy may be shorter than the signup
    // minimum; the sign-in form must never demand 10 characters.
    expect(validateCurrentPassword("old")).toBeUndefined();
    expect(validateCurrentPassword("1234")).toBeUndefined();
    expect(validateCurrentPassword("")).toBeDefined();
    expect(validateCurrentPassword("")).not.toMatch(/10 characters/);
  });
});

describe("confirm password validation", () => {
  it("requires a re-entry and a match", () => {
    expect(validateConfirmPassword("longenough1", "")).toBeDefined();
    expect(validateConfirmPassword("longenough1", "somethingelse")).toBe(
      "Passwords don't match.",
    );
    expect(validateConfirmPassword("longenough1", "longenough1")).toBeUndefined();
  });
});

describe("name and consent validation", () => {
  it("requires a name", () => {
    expect(validateName("")).toBeDefined();
    expect(validateName("   ")).toBeDefined();
    expect(validateName("Ngozi")).toBeUndefined();
  });

  it("requires the terms checkbox", () => {
    expect(validateTerms(false)).toMatch(/Terms/i);
    expect(validateTerms(true)).toBeUndefined();
  });

  it("reads the checkbox from FormData the way browsers submit it", () => {
    expect(hasAcceptedTerms(formData({ acceptTerms: "on" }))).toBe(true);
    expect(hasAcceptedTerms(formData({}))).toBe(false);
  });
});

describe("validateFields", () => {
  it("returns one message per failing field and nothing when all pass", () => {
    const validators = {
      email: (data: FormData) => validateEmail(String(data.get("email") ?? "")),
      password: (data: FormData) =>
        validateNewPassword(String(data.get("password") ?? "")),
    };

    expect(validateFields(formData({ email: "", password: "" }), validators)).toEqual({
      email: "Enter your email address.",
      password: "Choose a password.",
    });

    expect(
      validateFields(
        formData({ email: "ngozi@example.com", password: "longenough1" }),
        validators,
      ),
    ).toEqual({});
  });
});

describe("auth forms suppress native bubbles in favour of inline errors", () => {
  it("opts every credential form out of browser validation", () => {
    for (const Form of [SignupForm, LoginForm, ResetPasswordForm, ForgotPasswordForm]) {
      expect(staticMarkup(Form)).toMatch(/novalidate/i);
    }
  });

  it("keeps the sign-in password field lenient in the rendered markup", () => {
    const login = staticMarkup(LoginForm);
    expect(login).toMatch(/minlength="8"/i);
    expect(login).not.toContain("At least 10 characters");

    const signup = staticMarkup(SignupForm);
    expect(signup).toMatch(/minlength="10"/i);
    expect(signup).toContain("At least 10 characters");
  });

  it("gives the terms checkbox a clickable label and an error slot", () => {
    const signup = staticMarkup(SignupForm);
    expect(signup).toContain('for="acceptTerms"');
    expect(signup).toContain('id="acceptTerms"');
    // 44px minimum hit area on the label that wraps the consent checkbox.
    expect(signup).toContain("min-h-11");
  });
});
