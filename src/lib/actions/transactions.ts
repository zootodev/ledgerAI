"use server";

import { revalidatePath } from "next/cache";
import {
  createTransaction,
  updateTransaction,
  deleteTransaction,
} from "@/lib/services/transactions";
import type { TransactionInput } from "@/lib/services/transactions";

export interface TransactionActionState {
  ok?: boolean;
  error?: string;
}

const TRANSACTION_PATHS = ["/transactions", "/income", "/expenses", "/overview"];

function emptyToNull(value: string): string | null {
  return value.trim() === "" ? null : value.trim();
}

function readInput(formData: FormData): TransactionInput {
  return {
    date: String(formData.get("date") ?? ""),
    description: String(formData.get("description") ?? ""),
    amount: String(formData.get("amount") ?? ""),
    type: String(formData.get("type") ?? "") as TransactionInput["type"],
    accountId: emptyToNull(String(formData.get("accountId") ?? "")),
    categoryId: emptyToNull(String(formData.get("categoryId") ?? "")),
    reference: emptyToNull(String(formData.get("reference") ?? "")),
    notes: emptyToNull(String(formData.get("notes") ?? "")),
  };
}

/** Create a transaction owned by the session business via the service layer. */
export async function createTransactionAction(
  _prev: TransactionActionState,
  formData: FormData,
): Promise<TransactionActionState> {
  try {
    await createTransaction(readInput(formData));
    TRANSACTION_PATHS.forEach((p) => revalidatePath(p));
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Unable to save the transaction." };
  }
}

/** Update a transaction (id + fields) owned by the session business. */
export async function updateTransactionAction(
  _prev: TransactionActionState,
  formData: FormData,
): Promise<TransactionActionState> {
  const id = String(formData.get("id") ?? "");
  try {
    await updateTransaction(id, readInput(formData));
    TRANSACTION_PATHS.forEach((p) => revalidatePath(p));
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Unable to update the transaction." };
  }
}

/** Delete a transaction owned by the session business. */
export async function deleteTransactionAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  await deleteTransaction(id);
  TRANSACTION_PATHS.forEach((p) => revalidatePath(p));
}