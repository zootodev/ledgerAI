import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/server", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ getPrismaClient: vi.fn() }));
vi.mock("@/lib/auth/supabase", () => ({ getSupabaseServer: vi.fn() }));
vi.mock("@/lib/auth/app-url", () => ({ getAppBaseUrl: vi.fn() }));

const redirectMock = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

import { getCurrentUser } from "@/lib/auth/server";
import { getPrismaClient } from "@/lib/db/client";
import { ensureOnboarding } from "@/lib/services/auth";

const prismaMock = {
  user: { upsert: vi.fn() },
  business: { findFirst: vi.fn(), create: vi.fn() },
};

function signInUser() {
  vi.mocked(getCurrentUser).mockResolvedValue({
    id: "user-1",
    email: "ada@example.com",
    name: "Ada Lovelace",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getPrismaClient).mockReturnValue(prismaMock as never);
  signInUser();
  prismaMock.user.upsert.mockResolvedValue({ id: "user-1" });
  prismaMock.business.findFirst.mockResolvedValue({ id: "biz-1", type: null });
  prismaMock.business.create.mockResolvedValue({ id: "biz-1" });
});

describe("ensureOnboarding (onboarding gate)", () => {
  it("returns null without provisioning or redirecting when signed out", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const result = await ensureOnboarding();

    expect(result).toBeNull();
    expect(prismaMock.user.upsert).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("provisions the profile and business, then bounces an unfinished profile to /onboarding", async () => {
    const result = await ensureOnboarding();

    expect(prismaMock.user.upsert).toHaveBeenCalledTimes(1);
    // First business name comes from the user's first name.
    expect(prismaMock.business.create).not.toHaveBeenCalled(); // existing business → lookup only
    expect(redirectMock).toHaveBeenCalledWith("/onboarding");
    expect(result).toEqual({ id: "user-1", email: "ada@example.com" });
  });

  it("creates the first business from the user's first name when none exists", async () => {
    prismaMock.business.findFirst
      .mockResolvedValueOnce(null) // createInitialBusiness: no existing business
      .mockResolvedValueOnce({ id: "biz-1", type: null }); // gate: type still unset
    prismaMock.business.create.mockResolvedValue({ id: "biz-1" });

    await ensureOnboarding();

    expect(prismaMock.business.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: "Ada" }),
      }),
    );
  });

  it("does not redirect once the profile carries a business type", async () => {
    prismaMock.business.findFirst.mockResolvedValue({ id: "biz-1", type: "Retail" });

    const result = await ensureOnboarding();

    expect(redirectMock).not.toHaveBeenCalled();
    expect(result).toEqual({ id: "user-1", email: "ada@example.com" });
  });

  it("honours bounce: false (auth callback / onboarding page)", async () => {
    const result = await ensureOnboarding({ bounce: false });

    expect(redirectMock).not.toHaveBeenCalled();
    expect(result).toEqual({ id: "user-1", email: "ada@example.com" });
  });
});
