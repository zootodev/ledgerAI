"use server";

import { revalidatePath } from "next/cache";
import {
  getBusinessProfile,
  updateBusiness,
  type UpdateBusinessInput,
} from "@/lib/services/business";

export interface SettingsActionState {
  ok?: boolean;
  error?: string;
}

function emptyToNull(value: string): string | null {
  return value.trim() === "" ? null : value.trim();
}

export async function updateBusinessAction(
  _prev: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const input: UpdateBusinessInput = {
    name: String(formData.get("name") ?? ""),
    type: emptyToNull(String(formData.get("type") ?? "")),
    country: String(formData.get("country") ?? ""),
    currency: String(formData.get("currency") ?? ""),
    size: emptyToNull(String(formData.get("size") ?? "")),
  };

  try {
    // The share form does not edit goals, and the update schema defaults them
    // to [] — so carry the current goals through to avoid wiping them.
    const current = await getBusinessProfile();
    await updateBusiness({ ...input, goals: current.goals });
    revalidatePath("/settings/business");
    return { ok: true };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Unable to update business settings.",
    };
  }
}