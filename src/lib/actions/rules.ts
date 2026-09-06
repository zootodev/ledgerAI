"use server";

import { revalidatePath } from "next/cache";
import { deleteCategoryRule, listCategoryRules } from "@/lib/services/rules";
import type { CategoryRuleDto } from "@/types";

/** Server action that returns the business's learned rules (or [] on error). */
export async function getCategoryRulesAction(): Promise<CategoryRuleDto[]> {
  try {
    return await listCategoryRules();
  } catch {
    return [];
  }
}

/** Server action that deletes a learned rule. */
export async function deleteCategoryRuleAction(
  formData: FormData,
): Promise<{ ok?: boolean; error?: string }> {
  const id = String(formData.get("id") ?? "");
  try {
    await deleteCategoryRule(id);
    revalidatePath("/settings/rules");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Unable to delete the rule." };
  }
}
