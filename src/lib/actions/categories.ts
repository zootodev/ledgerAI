"use server";

import { revalidatePath } from "next/cache";
import {
  createCategory,
  updateCategory,
  deleteCategory,
} from "@/lib/services/categories";
import type { CategoryInput } from "@/lib/services/categories";

export interface CategoryActionState {
  ok?: boolean;
  error?: string;
}

function readInput(formData: FormData): CategoryInput {
  return {
    name: String(formData.get("name") ?? ""),
    type: String(formData.get("type") ?? "") as CategoryInput["type"],
  };
}

export async function createCategoryAction(
  _prev: CategoryActionState,
  formData: FormData,
): Promise<CategoryActionState> {
  try {
    await createCategory(readInput(formData));
    revalidatePath("/transactions");
    revalidatePath("/settings");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Unable to save the category." };
  }
}

export async function updateCategoryAction(
  _prev: CategoryActionState,
  formData: FormData,
): Promise<CategoryActionState> {
  const id = String(formData.get("id") ?? "");
  try {
    await updateCategory(id, readInput(formData));
    revalidatePath("/transactions");
    revalidatePath("/settings");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Unable to update the category." };
  }
}

export async function deleteCategoryAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  await deleteCategory(id);
  revalidatePath("/transactions");
  revalidatePath("/settings");
}