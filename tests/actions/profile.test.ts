import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/services/auth", () => ({
  updateOwnProfile: vi.fn(),
}));

import { revalidatePath } from "next/cache";
import { updateOwnProfile } from "@/lib/services/auth";
import {
  updateProfileAction,
  type SettingsActionState,
} from "@/lib/actions/profile";

const mockUpdateOwnProfile = vi.mocked(updateOwnProfile);

const prev: SettingsActionState = {};

function formData(name: string | undefined) {
  const fd = new FormData();
  if (name !== undefined) fd.set("name", name);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("updateProfileAction", () => {
  it("passes the name through to the service and revalidates on success", async () => {
    mockUpdateOwnProfile.mockResolvedValue({ ok: true });

    const result = await updateProfileAction(prev, formData("Ada Lovelace"));

    expect(result).toEqual({ ok: true });
    expect(mockUpdateOwnProfile).toHaveBeenCalledWith("Ada Lovelace");
    expect(revalidatePath).toHaveBeenCalledWith("/settings/profile");
  });

  it("surfaces a service-side validation error", async () => {
    mockUpdateOwnProfile.mockResolvedValue({
      ok: false,
      error: "Your name is required. (name)",
    });

    const result = await updateProfileAction(prev, formData(""));

    expect(result).toEqual({ error: "Your name is required. (name)" });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("turns an unexpected failure into a user-safe message", async () => {
    mockUpdateOwnProfile.mockRejectedValue(new Error("boom"));

    const result = await updateProfileAction(prev, formData("Ada"));

    expect(result).toEqual({ error: "boom" });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});