"use server";

import { revalidatePath } from "next/cache";
import {
  createAccount,
  updateAccount,
  deleteAccount,
} from "@/lib/services/accounts";
import type { AccountInput } from "@/lib/services/accounts";

export interface AccountActionState {
  ok?: boolean;
  error?: string;
}

function emptyToNull(value: string): string | null {
  return value.trim() === "" ? null : value.trim();
}

function readInput(formData: FormData): AccountInput {
  return {
    name: String(formData.get("name") ?? ""),
    institution: emptyToNull(String(formData.get("institution") ?? "")),
    currency: String(formData.get("currency") ?? ""),
  };
}

export async function createAccountAction(
  _prev: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  try {
    await createAccount(readInput(formData));
    revalidatePath("/transactions");
    revalidatePath("/settings");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Unable to save the account." };
  }
}

export async function updateAccountAction(
  _prev: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const id = String(formData.get("id") ?? "");
  try {
    await updateAccount(id, readInput(formData));
    revalidatePath("/transactions");
    revalidatePath("/settings");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Unable to update the account." };
  }
}

export async function deleteAccountAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  await deleteAccount(id);
  revalidatePath("/transactions");
  revalidatePath("/settings");
}