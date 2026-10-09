import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/services/business", () => ({ updateBusiness: vi.fn() }));

const redirectMock = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

import { updateBusiness } from "@/lib/services/business";
import { completeOnboardingAction } from "@/lib/actions/onboarding";

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

const VALID = {
  name: "Zooto Fashion",
  type: "Retail",
  country: "NG",
  currency: "NGN",
  size: "",
  goals: "Know my real profit, Stop losing receipts",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(updateBusiness).mockResolvedValue({} as never);
});

describe("completeOnboardingAction", () => {
  it("saves the profile and continues to the dashboard", async () => {
    const result = await completeOnboardingAction({}, form(VALID));

    expect(updateBusiness).toHaveBeenCalledWith({
      name: "Zooto Fashion",
      type: "Retail",
      country: "NG",
      currency: "NGN",
      size: null,
      goals: ["Know my real profit", "Stop losing receipts"],
    });
    expect(redirectMock).toHaveBeenCalledWith("/overview");
    expect(result).toBeUndefined();
  });

  it("rejects a missing business type without saving", async () => {
    const result = await completeOnboardingAction({}, form({ ...VALID, type: "" }));

    expect(result.error).toContain("Choose what your business does.");
    expect(updateBusiness).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("rejects a missing business name without saving", async () => {
    const result = await completeOnboardingAction({}, form({ ...VALID, name: " " }));

    expect(result.error).toBeTruthy();
    expect(updateBusiness).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("surfaces service errors and stays on the form", async () => {
    vi.mocked(updateBusiness).mockRejectedValue(new Error("Database down."));

    const result = await completeOnboardingAction({}, form(VALID));

    expect(result.error).toBe("Database down.");
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
