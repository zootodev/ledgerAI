import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
  getAppBaseUrl: vi.fn(async () => "http://172.20.10.2:3000"),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

vi.mock("@/lib/auth/app-url", () => ({
  getAppBaseUrl: mocks.getAppBaseUrl,
}));

// The card only needs *a* server action; the action's own behaviour is covered
// by confirm-action.test.ts.
vi.mock("@/app/(auth)/auth/confirm/actions", () => ({
  confirmEmailAction: vi.fn(),
}));

import ConfirmEmailPage, {
  dynamic as confirmDynamic,
  metadata,
} from "@/app/(auth)/auth/confirm/page";

async function render(params: Record<string, string>): Promise<string> {
  const element = await ConfirmEmailPage({ searchParams: Promise.resolve(params) });
  return renderToStaticMarkup(element);
}

function visible(markup: string): string {
  return markup.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAppBaseUrl.mockResolvedValue("http://172.20.10.2:3000");
});

describe("/auth/confirm page", () => {
  it("renders a single-button card that carries the untouched token", async () => {
    const markup = await render({ token_hash: "tok123", type: "email" });

    expect(visible(markup)).toContain("Confirm your email");
    expect(markup).toContain('value="tok123"');
    expect(markup).toContain('name="type" value="email"');
    // Exactly one button: the human's explicit second step.
    expect(markup.match(/<button/g) ?? []).toHaveLength(1);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("frames a recovery link as a password reset", async () => {
    const markup = await render({ token_hash: "tok123", type: "recovery" });

    expect(visible(markup)).toContain("Continue to reset your password");
  });

  it("is never indexed and never cached", () => {
    expect(metadata.robots).toMatchObject({ index: false, follow: false });
    expect(confirmDynamic).toBe("force-dynamic");
  });

  it("forwards a validated internal next target into the form", async () => {
    const markup = await render({
      token_hash: "tok123",
      type: "recovery",
      next: "/reset-password",
    });

    expect(markup).toContain('name="next" value="/reset-password"');
  });

  it("drops an external next instead of forwarding it", async () => {
    const markup = await render({
      token_hash: "tok123",
      type: "signup",
      next: "https://evil.example/steal",
    });

    expect(markup).not.toContain("evil.example");
    expect(markup).not.toContain('name="next"');
  });

  describe("dead-link error state", () => {
    it("re-renders the failure in place instead of redirecting to /login", async () => {
      // Regression guard: a signed-in visitor is bounced away from /login, so a
      // redirect there made the failure look like nothing happened.
      const markup = await render({ error: "auth_failed", type: "recovery" });

      expect(visible(markup)).toContain("This link has expired or was already used");
      expect(mocks.redirect).not.toHaveBeenCalled();
      // No form to submit: a dead link has no token to spend.
      expect(markup).not.toContain("<form");
      expect(markup.match(/<button/g) ?? []).toHaveLength(0);
    });

    it("offers a fresh reset link for a recovery failure", async () => {
      const markup = await render({ error: "auth_failed", type: "recovery" });

      expect(markup).toContain('href="/forgot-password"');
      expect(markup).toContain("Request a new password-reset link");
      expect(markup).not.toContain("/verify-email");
    });

    it("offers a fresh confirmation email for a non-recovery failure", async () => {
      const markup = await render({ error: "auth_failed", type: "signup" });

      expect(markup).toContain('href="/verify-email"');
      expect(markup).toContain("Resend confirmation email");
      expect(markup).not.toContain("/forgot-password");
    });

    it("defaults to a resend action when the link carried no usable type", async () => {
      const markup = await render({ error: "auth_failed" });

      expect(markup).toContain('href="/verify-email"');
      expect(markup).not.toContain("/forgot-password");
    });

    it("renders the error state for a truncated link instead of redirecting", async () => {
      const markup = await render({ type: "recovery" });

      expect(visible(markup)).toContain("This link has expired or was already used");
      expect(mocks.redirect).not.toHaveBeenCalled();
    });

    it("renders the error state for an unknown verification type and never echoes the token", async () => {
      const markup = await render({ token_hash: "tok123", type: "bogus" });

      expect(visible(markup)).toContain("This link has expired or was already used");
      expect(markup).not.toContain("tok123");
      expect(mocks.redirect).not.toHaveBeenCalled();
    });

    it("never reflects an error value from the URL", async () => {
      const markup = await render({ error: "<img src=x onerror=alert(1)>" });

      expect(markup).not.toContain("onerror");
      expect(markup).not.toContain("<img");
      expect(visible(markup)).toContain("This link has expired or was already used");
    });
  });
});
