import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSupabaseServer: vi.fn(),
}));

vi.mock("@/lib/auth/supabase", () => ({
  getSupabaseServer: mocks.getSupabaseServer,
}));

import { signOutEverywhere } from "@/lib/services/auth";

const signOut = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  signOut.mockResolvedValue({ error: null });
  mocks.getSupabaseServer.mockResolvedValue({ auth: { signOut } });
});

describe("signOutEverywhere", () => {
  it("revokes every session with Supabase global scope", async () => {
    await signOutEverywhere();

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(signOut).toHaveBeenCalledWith({ scope: "global" });
  });
});
