import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/app-url", () => ({
  getAppBaseUrl: vi.fn(async () => "http://172.20.10.2:3000"),
}));

vi.mock("@/lib/auth/supabase", () => ({
  getSupabaseServer: vi.fn(),
}));

vi.mock("@/lib/services/auth", () => ({
  ensureOnboarding: vi.fn(),
  needsOnboarding: vi.fn(),
}));

import { getAppBaseUrl } from "@/lib/auth/app-url";
import { getSupabaseServer } from "@/lib/auth/supabase";
import { ensureOnboarding, needsOnboarding } from "@/lib/services/auth";
import { GET } from "@/app/auth/callback/route";

const exchangeMock = vi.fn();
const verifyOtpMock = vi.fn();
const supabaseMock = {
  auth: { exchangeCodeForSession: exchangeMock, verifyOtp: verifyOtpMock },
};

function callbackRequest(url: string) {
  return new Request(url);
}

/** Build a callback URL with `next` set to the exact decoded value the validator sees. */
function callbackWithNext(nextValue: string): string {
  const url = new URL("http://172.20.10.2:3000/auth/callback?code=abc");
  url.searchParams.set("next", nextValue);
  return url.toString();
}

/** Build a decodable (unverified) JWT carrying the session's `aal` claim. */
function jwt(payload: Record<string, unknown>): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `header.${body}.signature`;
}

function redirectLocation(response: Response): string {
  return response.headers.get("location") ?? "";
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getAppBaseUrl).mockResolvedValue("http://172.20.10.2:3000");
  vi.mocked(getSupabaseServer).mockResolvedValue(supabaseMock as never);
  exchangeMock.mockResolvedValue({ data: { session: { access_token: "t" } }, error: null });
  vi.mocked(ensureOnboarding).mockResolvedValue({
    id: "11111111-1111-4111-8111-111111111111",
    email: "new@example.com",
  });
  vi.mocked(needsOnboarding).mockResolvedValue(false);
  verifyOtpMock.mockResolvedValue({ data: { session: { access_token: "t" } }, error: null });
});

describe("auth/callback route", () => {
  it("redirects to the sign-in page when the code is missing", async () => {
    const response = await GET(callbackRequest("http://172.20.10.2:3000/auth/callback"));

    expect(response.status).toBeGreaterThanOrEqual(300);
    expect(response.status).toBeLessThanOrEqual(308);
    expect(redirectLocation(response)).toBe(
      "http://172.20.10.2:3000/auth/confirm?error=missing_code",
    );
    expect(exchangeMock).not.toHaveBeenCalled();
    expect(ensureOnboarding).not.toHaveBeenCalled();
  });

  it("exchanges the PKCE code, runs onboarding once, and redirects to /overview", async () => {
    const response = await GET(
      callbackRequest("http://172.20.10.2:3000/auth/callback?code=sUpErSecRet"),
    );

    expect(exchangeMock).toHaveBeenCalledWith("sUpErSecRet");
    expect(ensureOnboarding).toHaveBeenCalledTimes(1);
    // The callback must never bounce to /onboarding — `next` may point at
    // /reset-password and the recovery session has to land there.
    expect(ensureOnboarding).toHaveBeenCalledWith({ bounce: false });
    expect(redirectLocation(response)).toBe("http://172.20.10.2:3000/overview");
  });

  it("forwards a token_hash link to /auth/confirm without consuming it on GET", async () => {
    // Regression guard: a mail scanner pre-fetches every link in an email. The
    // GET must never verify the one-time token, or the human's own click would
    // fail with "One-time token not found".
    const response = await GET(
      callbackRequest("http://172.20.10.2:3000/auth/callback?token_hash=abc123&type=email"),
    );

    expect(verifyOtpMock).not.toHaveBeenCalled();
    expect(exchangeMock).not.toHaveBeenCalled();
    expect(ensureOnboarding).not.toHaveBeenCalled();

    const location = redirectLocation(response);
    const forwarded = new URL(location);
    expect(forwarded.origin).toBe("http://172.20.10.2:3000");
    expect(forwarded.pathname).toBe("/auth/confirm");
    expect(forwarded.searchParams.get("token_hash")).toBe("abc123");
    expect(forwarded.searchParams.get("type")).toBe("email");
  });

  it("preserves `next` when forwarding a token_hash link", async () => {
    const response = await GET(
      callbackRequest(
        "http://172.20.10.2:3000/auth/callback?token_hash=abc123&type=recovery&next=%2Freset-password",
      ),
    );

    expect(verifyOtpMock).not.toHaveBeenCalled();
    const forwarded = new URL(redirectLocation(response));
    expect(forwarded.pathname).toBe("/auth/confirm");
    expect(forwarded.searchParams.get("type")).toBe("recovery");
    expect(forwarded.searchParams.get("next")).toBe("/reset-password");
  });

  it("rejects a token_hash link with an unknown verification type", async () => {
    const response = await GET(
      callbackRequest("http://172.20.10.2:3000/auth/callback?token_hash=abc123&type=bogus"),
    );

    expect(redirectLocation(response)).toBe(
      "http://172.20.10.2:3000/auth/confirm?error=missing_code",
    );
    expect(verifyOtpMock).not.toHaveBeenCalled();
  });

  it("sends a brand-new user to /onboarding when no `next` is given", async () => {
    vi.mocked(needsOnboarding).mockResolvedValue(true);

    const response = await GET(callbackRequest("http://172.20.10.2:3000/auth/callback?code=abc"));

    expect(redirectLocation(response)).toBe("http://172.20.10.2:3000/onboarding");
  });

  it("does not divert an explicit `next` (recovery) to onboarding", async () => {
    vi.mocked(needsOnboarding).mockResolvedValue(true);

    const response = await GET(
      callbackRequest("http://172.20.10.2:3000/auth/callback?code=abc&next=%2Freset-password"),
    );

    expect(needsOnboarding).not.toHaveBeenCalled();
    expect(redirectLocation(response)).toBe("http://172.20.10.2:3000/reset-password");
  });

  it("respects an internal `next` target", async () => {
    const response = await GET(
      callbackRequest(
        "http://172.20.10.2:3000/auth/callback?code=abc&next=%2Ftransactions",
      ),
    );

    expect(redirectLocation(response)).toBe("http://172.20.10.2:3000/transactions");
  });

  it("sanitizes a malicious `next` target (open-redirect protection)", async () => {
    const response = await GET(
      callbackRequest("http://172.20.10.2:3000/auth/callback?code=abc&next=https%3A%2F%2Fevil.example"),
    );

    expect(redirectLocation(response)).toBe("http://172.20.10.2:3000/overview");
  });

  it.each([
    ["protocol-relative //", "//evil.example"],
    ["pre-encoded protocol-relative (// decodes to //)", "%2F%2Fevil.example"],
    ["backslash-smuggled host /\\", "/\\evil.example"],
    ["double backslash \\\\", "\\\\evil.example"],
    ["absolute http", "http://evil.example"],
    ["absolute https", "https://evil.example"],
    ["scheme in path", "javascript:alert(1)"],
    ["control NUL in path", "/overview\u0000evil.example"],
    ["control char in query", "/settings?tab=\u0000"],
    ["whitespace in path", "/overview next"],
    ["not a path", "overview"],
  ])(
    "forces the default internal target for a malicious next %s",
    async (_label, decodedValue) => {
      const response = await GET(new Request(callbackWithNext(decodedValue)));

      const location = redirectLocation(response);
      expect(location.startsWith("http://172.20.10.2:3000/")).toBe(true);
      expect(location.endsWith("/overview")).toBe(true);
    },
  );

  it("keeps legitimate internal redirects intact", async () => {
    const expected: Record<string, string> = {
      "/dashboard": "http://172.20.10.2:3000/dashboard",
      "/transactions": "http://172.20.10.2:3000/transactions",
      "/settings": "http://172.20.10.2:3000/settings",
      "/ask": "http://172.20.10.2:3000/ask",
      "/ask-v2": "http://172.20.10.2:3000/ask-v2",
      "/overview": "http://172.20.10.2:3000/overview",
      "/reset-password": "http://172.20.10.2:3000/reset-password",
      "/transactions?page=2&tab=income": "http://172.20.10.2:3000/transactions?page=2&tab=income",
    };

    for (const [path, expectedLocation] of Object.entries(expected)) {
      const response = await GET(
        callbackRequest(
          `http://172.20.10.2:3000/auth/callback?code=abc&next=${encodeURIComponent(path)}`,
        ),
      );
      expect(redirectLocation(response)).toBe(expectedLocation);
    }
  });

  it("re-renders the failure on /auth/confirm when the exchange fails", async () => {
    exchangeMock.mockResolvedValue({ data: { session: null }, error: { message: "invalid code" } });

    const response = await GET(callbackRequest("http://172.20.10.2:3000/auth/callback?code=bad"));

    expect(redirectLocation(response)).toBe(
      "http://172.20.10.2:3000/auth/confirm?error=auth_failed",
    );
    expect(ensureOnboarding).not.toHaveBeenCalled();
  });

  it("passes a known link type through on failure so the right recovery is offered", async () => {
    exchangeMock.mockResolvedValue({ data: { session: null }, error: { message: "expired" } });

    const response = await GET(
      callbackRequest("http://172.20.10.2:3000/auth/callback?code=bad&type=recovery"),
    );

    expect(redirectLocation(response)).toBe(
      "http://172.20.10.2:3000/auth/confirm?error=auth_failed&type=recovery",
    );
  });

  it("routes a recovery exchange for an MFA account through the challenge first", async () => {
    exchangeMock.mockResolvedValue({
      data: {
        user: { factors: [{ status: "verified" }] },
        session: { access_token: jwt({ aal: "aal1" }) },
      },
      error: null,
    });

    const response = await GET(
      callbackRequest(
        "http://172.20.10.2:3000/auth/callback?code=abc&next=%2Freset-password",
      ),
    );

    expect(redirectLocation(response)).toBe(
      "http://172.20.10.2:3000/auth/mfa?next=%2Freset-password",
    );
  });

  it("redirects to sign-in when Supabase is not configured", async () => {
    vi.mocked(getSupabaseServer).mockResolvedValue(null);

    const response = await GET(callbackRequest("http://172.20.10.2:3000/auth/callback?code=abc"));

    expect(redirectLocation(response)).toBe("http://172.20.10.2:3000/login?error=not_configured");
    expect(exchangeMock).not.toHaveBeenCalled();
    expect(ensureOnboarding).not.toHaveBeenCalled();
  });
});