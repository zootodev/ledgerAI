import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/services/business", () => ({
  getBusinessProfile: vi.fn(),
  updateBusiness: vi.fn(),
}));

import { revalidatePath } from "next/cache";
import {
  getBusinessProfile,
  updateBusiness,
} from "@/lib/services/business";
import {
  updateBusinessAction,
  type SettingsActionState,
} from "@/lib/actions/business";

const mockGetBusinessProfile = vi.mocked(getBusinessProfile);
const mockUpdateBusiness = vi.mocked(updateBusiness);

const prev: SettingsActionState = {};

function formData(overrides: Record<string, string> = {}) {
  const fd = new FormData();
  fd.set("name", overrides.name ?? "Zooto Fashion");
  fd.set("type", overrides.type ?? "Retail");
  fd.set("country", overrides.country ?? "NG");
  fd.set("currency", overrides.currency ?? "NGN");
  fd.set("size", overrides.size ?? "1-5");
  return fd;
}

beforeEach(() => {
  vi.resetAllMocks();
  mockGetBusinessProfile.mockResolvedValue({
    id: "biz-a",
    name: "Zooto Fashion",
    type: "Retail",
    country: "NG",
    currency: "NGN",
    size: "1-5",
    goals: ["Grow revenue"],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  mockUpdateBusiness.mockResolvedValue({
    id: "biz-a",
    name: "Zooto Fashion",
    type: "Retail",
    country: "NG",
    currency: "NGN",
    size: "1-5",
    goals: ["Grow revenue"],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
});

describe("updateBusinessAction", () => {
  it("submits the form fields and preserves the existing goals", async () => {
    const result = await updateBusinessAction(prev, formData());

    expect(result).toEqual({ ok: true });
    expect(mockUpdateBusiness).toHaveBeenCalledWith({
      name: "Zooto Fashion",
      type: "Retail",
      country: "NG",
      currency: "NGN",
      size: "1-5",
      goals: ["Grow revenue"],
    });
    expect(revalidatePath).toHaveBeenCalledWith("/settings/business");
  });

  it("normalizes empty optional selects to null", async () => {
    await updateBusinessAction(
      prev,
      formData({ type: "", size: "" }),
    );

    expect(mockUpdateBusiness).toHaveBeenCalledWith(
      expect.objectContaining({ type: null, size: null }),
    );
  });

  it("surfaces a service-side validation error", async () => {
    mockUpdateBusiness.mockRejectedValue(new Error("Business name is required."));

    const result = await updateBusinessAction(prev, formData());

    expect(result).toEqual({ error: "Business name is required." });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("turns an unexpected failure into a user-safe message", async () => {
    mockGetBusinessProfile.mockRejectedValue(new Error("boom"));

    const result = await updateBusinessAction(prev, formData());

    expect(result).toEqual({ error: "boom" });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});