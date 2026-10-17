import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getMfaStatus: vi.fn(),
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
  MfaChallengeForm: vi.fn(() => null as never),
}));

vi.mock("@/lib/auth/server", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));

vi.mock("@/lib/services/mfa", () => ({
  getMfaStatus: mocks.getMfaStatus,
}));

vi.mock("@/lib/auth/app-url", () => ({
  getAppBaseUrl: vi.fn(async () => "http://localhost:3000"),
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

vi.mock("@/components/auth/mfa-challenge-form", () => ({
  MfaChallengeForm: mocks.MfaChallengeForm,
}));

import MfaChallengePage from "@/app/(auth)/auth/mfa/page";

const AUTHED = { id: "auth-user-a", email: "a@example.com", name: "User A" };
const AAL1_WITH_FACTOR = {
  enabled: true,
  currentLevel: "aal1",
  nextLevel: "aal2",
  factors: [{ id: "factor-1", status: "verified" }],
};

/** The page receives Next's Promise-wrapped searchParams. */
function params(next?: string | string[]) {
  return Promise.resolve(next === undefined ? {} : { next });
}

/** Invoke the page and read the props it handed to the challenge form. */
async function challengeProps(raw?: string | string[]) {
  const element = (await MfaChallengePage({
    searchParams: params(raw),
  })) as unknown as { props: { next: string; email: string } };
  return element.props;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.MfaChallengeForm.mockImplementation(() => null as never);
  mocks.getCurrentUser.mockResolvedValue(AUTHED);
  mocks.getMfaStatus.mockResolvedValue(AAL1_WITH_FACTOR);
});

describe("MfaChallengePage next validation", () => {
  it("carries a valid internal target into the challenge form", async () => {
    const props = await challengeProps("/reset-password");

    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(props.next).toBe("/reset-password");
    expect(props.email).toBe("a@example.com");
  });

  it.each([
    ["an external URL", "https://evil.example.com"],
    ["a protocol-relative URL", "//evil.example.com"],
    ["an absolute URL on another origin", "http://localhost:3001/transactions"],
    ["a repeated (non-string) param", ["/transactions", "/settings"]],
  ])("drops %s and falls back to the overview", async (_label, raw) => {
    const props = await challengeProps(raw as string | string[]);

    expect(props.next).toBe("/overview");
  });

  it("defaults to the overview when no target is given", async () => {
    const props = await challengeProps();

    expect(props.next).toBe("/overview");
  });

  it("still redirects an aal2 session away from the challenge", async () => {
    mocks.getMfaStatus.mockResolvedValue({
      ...AAL1_WITH_FACTOR,
      currentLevel: "aal2",
    });

    await expect(
      MfaChallengePage({ searchParams: params("/reset-password") }),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith("/overview");
  });
});
