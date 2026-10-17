import { describe, expect, it, vi } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/lib/auth/actions", () => ({
  verifyMfaAction: vi.fn(),
  signOutAction: vi.fn(),
  enrollMfaAction: vi.fn(),
  confirmMfaAction: vi.fn(),
  disableMfaAction: vi.fn(),
}));

import { MfaChallengeForm } from "@/components/auth/mfa-challenge-form";
import { SecuritySettings } from "@/components/settings/security-settings";

function html(element: React.ReactElement): string {
  return renderToStaticMarkup(element);
}

function visible(markup: string): string {
  return markup.replace(/<[^>]*>/g, " ");
}

describe("MfaChallengeForm", () => {
  const base = html(<MfaChallengeForm next="/transactions" email="a@example.com" />);

  it("labels the code input and accepts a one-time code", () => {
    expect(base).toContain("Authentication code");
    expect(base).toMatch(/autocomplete="one-time-code"/i);
    expect(base).toMatch(/inputmode="numeric"/i);
    expect(base).toMatch(/maxlength="6"/i);
  });

  it("carries the sanitized next target and offers a sign-out escape", () => {
    expect(base).toContain('value="/transactions"');
    expect(visible(base)).toContain("Sign out");
  });

  it("shows the account being verified without exposing anything else", () => {
    expect(visible(base)).toContain("a@example.com");
  });
});

describe("SecuritySettings", () => {
  it("offers enrollment when 2FA is off", () => {
    const out = html(<SecuritySettings mfaEnabled={false} />);
    expect(visible(out)).toContain("Set up two-factor authentication");
    expect(visible(out)).toContain("currently off");
  });

  it("shows status and a code-confirmed disable form when 2FA is on", () => {
    const out = html(<SecuritySettings mfaEnabled factorName="My phone" />);
    expect(visible(out)).toContain("Two-factor authentication is on");
    expect(visible(out)).toContain("My phone");
    expect(visible(out)).toContain("Turn off two-factor authentication");
    // Disabling always requires a current code.
    expect(out).toContain('name="code"');
    expect(out).toMatch(/autocomplete="one-time-code"/i);
  });
});
