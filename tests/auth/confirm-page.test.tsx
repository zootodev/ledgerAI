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

  it("rejects an unknown verification type", async () => {
    await expect(render({ token_hash: "tok123", type: "bogus" })).rejects.toThrow(
      "NEXT_REDIRECT",
    );
    expect(mocks.redirect).toHaveBeenCalledWith("/login?error=missing_code");
  });

  it("rejects a missing token", async () => {
    await expect(render({ type: "recovery" })).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith("/login?error=missing_code");
  });
});
