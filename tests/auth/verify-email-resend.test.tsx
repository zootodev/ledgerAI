import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/lib/auth/actions", () => ({
  resendVerificationAction: vi.fn(),
}));

import { ResendVerificationForm } from "@/components/auth/resend-verification-form";

function render(props: {
  initialEmail?: string;
  sent?: boolean;
} = {}) {
  return renderToStaticMarkup(<ResendVerificationForm {...props} />);
}

/** Strips sr-only helper text so assertions only see what a sighted user reads. */
function visible(html: string): string {
  return html.replace(/<span class="sr-only"[^>]*>.*?<\/span>/g, "");
}

describe("ResendVerificationForm (verify-email)", () => {
  it("leads with the inbox instruction rather than the resend action", () => {
    const html = visible(render({ initialEmail: "owner@example.com" }));

    expect(html).toContain("Check your inbox (and spam) for the link");
    // Still explains why confirmation is required.
    expect(html).toContain("confirm your email address before signing in");
    // And keeps the resend available as a secondary control.
    expect(html).toContain("Resend confirmation email");
  });

  it("shows the address the link was sent to when it is known", () => {
    const html = visible(render({ initialEmail: "owner@example.com" }));

    expect(html).toContain("to owner@example.com");
  });

  it("starts a cooldown after a resend so it cannot be spammed", () => {
    // Reaching this screen with ?sent=1 means a link just went out.
    const html = visible(render({ initialEmail: "owner@example.com", sent: true }));

    expect(html).toContain("Resend available in 30s.");
    // The button stays present (so the action is never lost) but is inert.
    expect(html).toMatch(/<button[^>]*disabled=""/);
  });

  it("does not disable the resend on a fresh visit", () => {
    const html = render({ initialEmail: "owner@example.com" });

    expect(html).not.toContain("Resend available in");
    // NB: match the attribute, not the `disabled:*` utility classes.
    expect(html).not.toMatch(/<button[^>]*disabled=""/);
  });

  it("keeps the email field prefillable", () => {
    const html = render({ initialEmail: "owner@example.com" });

    expect(html).toContain('value="owner@example.com"');
  });
});
