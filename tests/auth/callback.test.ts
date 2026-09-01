import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/app-url", () => ({
  getAppBaseUrl: vi.fn(async () => "http://172.20.10.2:3000"),
}));

vi.mock("@/lib/auth/supabase", () => ({
  getSupabaseServer: vi.fn(),
}));

vi.mock("@/lib/services/auth", () => ({
  ensureOnboarding: vi.fn(),
}));

import { getAppBaseUrl } from "@/lib/auth/app-url";
import { getSupabaseServer } from "@/lib/auth/supabase";
import { ensureOnboarding } from "@/lib/services/auth";
import { GET } from "@/app/auth/callback/route";

const exchangeMock = vi.fn();
const supabaseMock = { auth: { exchangeCodeForSession: exchangeMock } };

function callbackRequest(url: string) {
  return new Request(url);
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
});

describe("auth/callback route", () => {
  it("redirects to the sign-in page when the code is missing", async () => {
    const response = await GET(callbackRequest("http://172.20.10.2:3000/auth/callback"));

    expect(response.status).toBeGreaterThanOrEqual(300);
    expect(response.status).toBeLessThanOrEqual(308);
    expect(redirectLocation(response)).toBe("http://172.20.10.2:3000/login?error=missing_code");
    expect(exchangeMock).not.toHaveBeenCalled();
    expect(ensureOnboarding).not.toHaveBeenCalled();
  });

  it("exchanges the PKCE code, runs onboarding once, and redirects to /overview", async () => {
    const response = await GET(
      callbackRequest("http://172.20.10.2:3000/auth/callback?code=sUpErSecRet"),
    );

    expect(exchangeMock).toHaveBeenCalledWith("sUpErSecRet");
    expect(ensureOnboarding).toHaveBeenCalledTimes(1);
    expect(redirectLocation(response)).toBe("http://172.20.10.2:3000/overview");
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

  it("redirects to sign-in and skips onboarding when the exchange fails", async () => {
    exchangeMock.mockResolvedValue({ data: { session: null }, error: { message: "invalid code" } });

    const response = await GET(callbackRequest("http://172.20.10.2:3000/auth/callback?code=bad"));

    expect(redirectLocation(response)).toBe("http://172.20.10.2:3000/login?error=auth_failed");
    expect(ensureOnboarding).not.toHaveBeenCalled();
  });

  it("redirects to sign-in when Supabase is not configured", async () => {
    vi.mocked(getSupabaseServer).mockResolvedValue(null);

    const response = await GET(callbackRequest("http://172.20.10.2:3000/auth/callback?code=abc"));

    expect(redirectLocation(response)).toBe("http://172.20.10.2:3000/login?error=not_configured");
    expect(exchangeMock).not.toHaveBeenCalled();
    expect(ensureOnboarding).not.toHaveBeenCalled();
  });
});