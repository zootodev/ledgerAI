"use server";

import { revalidatePath } from "next/cache";
import { updateOwnProfile } from "@/lib/services/auth";

export interface SettingsActionState {
  ok?: boolean;
  error?: string;
}

export async function updateProfileAction(
  _prev: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  try {
    const result = await updateOwnProfile(String(formData.get("name") ?? ""));
    if (!result.ok) return { error: result.error };
    revalidatePath("/settings/profile");
    return { ok: true };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Unable to update your profile.",
    };
  }
}