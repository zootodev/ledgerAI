import { describe, expect, it, vi } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/lib/auth/actions", () => ({
  deleteAccountAction: vi.fn(),
  resendVerificationAction: vi.fn(),
}));

import { AccountSettings } from "@/components/settings/account-settings";
import { ResendVerificationForm } from "@/components/auth/resend-verification-form";

function html(element: React.ReactElement): string {
  return renderToStaticMarkup(element);
}

function visible(markup: string): string {
  return markup.replace(/<[^>]*>/g, " ");
}

describe("AccountSettings", () => {
  const markup = html(<AccountSettings email="owner@example.com" />);

  it("offers JSON and CSV export links to the protected export route", () => {
    expect(markup).toContain('href="/account/export?format=json"');
    expect(markup).toContain('href="/account/export?format=csv"');
    expect(markup).toContain("download");
  });

  it("requires a typed confirmation and shows which account is deleted", () => {
    expect(visible(markup)).toContain("owner@example.com");
    expect(visible(markup)).toContain("Type &quot;DELETE&quot; to confirm");
    expect(markup).toContain('name="confirm"');
    // Deletion can't fire until "DELETE" is typed.
    expect(markup).toMatch(/<button[^>]*disabled/);
  });

  it("warns that deletion is permanent", () => {
    expect(visible(markup)).toContain("cannot be undone");
  });
});

describe("ResendVerificationForm", () => {
  it("prefills the email and labels the field", () => {
    const markup = html(<ResendVerificationForm initialEmail="owner@example.com" />);
    expect(markup).toContain('value="owner@example.com"');
    expect(visible(markup)).toContain("Email");
    expect(visible(markup)).toContain("Resend confirmation email");
  });

  it("explains that confirmation is required before signing in", () => {
    const markup = html(<ResendVerificationForm />);
    expect(visible(markup)).toContain("confirm your email address before signing in");
  });
});
