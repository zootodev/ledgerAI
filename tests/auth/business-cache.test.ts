import { beforeEach, describe, expect, it, vi } from "vitest";

// One Headers instance per simulated request; Next.js memoizes headers() so a
// Server Action and its same-response re-render share this object.
const { requestHeadersRef } = vi.hoisted(() => ({
  requestHeadersRef: { current: new Headers() },
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => requestHeadersRef.current),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ getPrismaClient: vi.fn() }));

import { updateBusinessAction } from "@/lib/actions/business";
import { getCurrentUser } from "@/lib/auth/server";
import { getPrismaClient } from "@/lib/db/client";
import { getPrimaryBusiness, requireAuthContext } from "@/lib/services/auth-context";

const userA = { id: "user-a", email: "a@example.com", name: "Ada" };
const userB = { id: "user-b", email: "b@example.com", name: "Grace" };

const oldProfile = {
  id: "biz-a",
  userId: userA.id,
  name: "Old Name",
  type: "Retail",
  country: "NG",
  currency: "NGN",
  size: "1-5",
  goals: ["Grow revenue"],
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

const updatedProfile = {
  ...oldProfile,
  name: "New Name",
  currency: "USD",
  updatedAt: new Date("2026-01-02"),
};

function settingsForm(): FormData {
  const form = new FormData();
  form.set("name", "New Name");
  form.set("type", "Retail");
  form.set("country", "NG");
  form.set("currency", "USD");
  form.set("size", "1-5");
  return form;
}

const findFirst = vi.fn();
const update = vi.fn();
const prismaMock = { business: { findFirst, update } };

beforeEach(() => {
  vi.clearAllMocks();
  requestHeadersRef.current = new Headers();
  vi.mocked(getPrismaClient).mockReturnValue(prismaMock as never);
});

describe("primary business request cache", () => {
  it("seeds the updated currency so the action re-render sees it", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(userA);
    findFirst
      .mockResolvedValueOnce({
        id: oldProfile.id,
        name: oldProfile.name,
        currency: oldProfile.currency,
        type: oldProfile.type,
      })
      .mockResolvedValueOnce(oldProfile);
    update.mockResolvedValue(updatedProfile);

    await expect(updateBusinessAction({}, settingsForm())).resolves.toEqual({ ok: true });

    // The same request's re-render reads the seeded value, not the original
    // NGN lookup. No extra business query is issued.
    await expect(requireAuthContext()).resolves.toMatchObject({
      business: { id: oldProfile.id, currency: "USD" },
    });
    await expect(getPrimaryBusiness(userA.id)).resolves.toMatchObject({
      id: oldProfile.id,
      currency: "USD",
    });
    expect(findFirst).toHaveBeenCalledTimes(2);
  });

  it("does not cache a failed lookup, so the next call retries", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(userB);
    findFirst
      .mockRejectedValueOnce(new Error("connection timed out"))
      .mockRejectedValueOnce(new Error("connection timed out"))
      .mockResolvedValueOnce({
        id: "biz-b",
        name: "Grace Studio",
        currency: "GHS",
        type: "Retail",
      });

    await expect(getPrimaryBusiness(userB.id)).rejects.toThrow("connection timed out");

    await expect(getPrimaryBusiness(userB.id)).resolves.toMatchObject({
      id: "biz-b",
      currency: "GHS",
    });

    // The successful value is now cached for the rest of the request.
    await expect(getPrimaryBusiness(userB.id)).resolves.toMatchObject({
      id: "biz-b",
      currency: "GHS",
    });
    expect(findFirst).toHaveBeenCalledTimes(3);
  });
});
