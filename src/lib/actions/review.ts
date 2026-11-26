"use server";

import { revalidatePath } from "next/cache";
import {
  applyReviewAction,
  listReviewGroups,
  undoReviewAction,
} from "@/lib/services/review";

const REVIEW_PATHS = ["/review", "/transactions", "/overview"];

export interface ReviewActionState {
  ok?: boolean;
  error?: string;
  affected?: number;
  clearedByCascade?: number;
  restored?: number;
  /** Signed snapshot for the ~10s undo window; validated again on use. */
  undoToken?: string;
}

function revalidateReview() {
  REVIEW_PATHS.forEach((path) => revalidatePath(path));
}

/** Accept a group's suggestion (or apply one override category to the group). */
export async function applyReviewGroupAction(
  formData: FormData,
): Promise<ReviewActionState> {
  const groupKey = String(formData.get("groupKey") ?? "");
  const categoryId = String(formData.get("categoryId") ?? "").trim() || undefined;
  try {
    const result = await applyReviewAction({ scope: "group", groupKey, categoryId });
    revalidateReview();
    return {
      ok: true,
      affected: result.affected,
      clearedByCascade: result.clearedByCascade,
      undoToken: result.undoToken,
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to review this group." };
  }
}

/** Apply the AI suggestion to every row still waiting in Review. */
export async function acceptAllRemainingAction(
  formData: FormData,
): Promise<ReviewActionState> {
  // The form carries a confirmation summary only; row selection is server-side.
  void formData;
  try {
    const result = await applyReviewAction({ scope: "all" });
    revalidateReview();
    return {
      ok: true,
      affected: result.affected,
      clearedByCascade: result.clearedByCascade,
      undoToken: result.undoToken,
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to accept all suggestions." };
  }
}

/** Restore the exact previous state captured when the group was applied. */
export async function undoReviewGroupAction(
  formData: FormData,
): Promise<ReviewActionState> {
  try {
    const token = String(formData.get("token") ?? "");
    const restored = await undoReviewAction(token);
    revalidateReview();
    return { ok: true, restored };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to undo this review." };
  }
}

/** Fetch the next ten groups without losing the current session's progress. */
export async function listMoreReviewGroupsAction(formData: FormData): Promise<{
  ok?: boolean;
  error?: string;
  groups?: Awaited<ReturnType<typeof listReviewGroups>>["groups"];
  totalGroups?: number;
  totalRows?: number;
  totalAmount?: number;
}> {
  const offset = Number(formData.get("offset") ?? 0);
  try {
    const result = await listReviewGroups(offset);
    return {
      ok: true,
      groups: result.groups,
      totalGroups: result.totalGroups,
      totalRows: result.totalRows,
      totalAmount: result.totalAmount,
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to load more groups." };
  }
}
