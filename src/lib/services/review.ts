// ============================================================
// LedgerAI — grouped low-confidence review service
// ------------------------------------------------------------
// Every read and write derives businessId from the session. A client can
// only name a group key or a category id; the rows themselves are always
// re-loaded from the tenant-scoped low-confidence queue on the server.
// ============================================================

import { requireAuthContext } from "@/lib/services/auth-context";
import { learnMerchantRule } from "@/lib/services/rules";
import { extractMerchantKey } from "@/lib/ai/merchant-key";
import { categorizeByRules, REVIEW_THRESHOLD } from "@/lib/ai/rules";
import { transactionIdSchema, zErrorMessage } from "@/lib/validation/index";
import { groupLowConfidenceRows, type ReviewGroup, type ReviewRowInput } from "@/lib/review/groups";
import { signUndoToken, verifyUndoToken } from "@/lib/review/undo-token";
import type { PrismaClient } from "@/generated/prisma/client";
import type { CategoryRuleDto } from "@/types";

export const REVIEW_PAGE_SIZE = 10;

export interface ReviewListResult {
  groups: ReviewGroup[];
  totalGroups: number;
  totalRows: number;
  /** Absolute total across every pending row, major currency units. */
  totalAmount: number;
}

interface StoredReviewRow extends ReviewRowInput {
  /** Exact Decimal text from the database, used for byte-for-byte undo. */
  aiConfidenceRaw: string | null;
  type: "income" | "expense" | "transfer";
}

async function loadLowConfidenceRows(
  prisma: PrismaClient,
  businessId: string,
): Promise<StoredReviewRow[]> {
  const rows = await prisma.transaction.findMany({
    where: {
      businessId,
      categoryId: { not: null },
      aiConfidence: { lt: REVIEW_THRESHOLD },
    },
    orderBy: [{ date: "asc" }, { id: "asc" }],
    select: {
      id: true,
      description: true,
      amount: true,
      date: true,
      categoryId: true,
      aiCategory: true,
      aiConfidence: true,
      type: true,
    },
  });

  return rows.map((row) => ({
    id: row.id,
    description: row.description,
    amount: row.amount.toString(),
    date: row.date.toISOString().slice(0, 10),
    categoryId: row.categoryId,
    aiCategory: row.aiCategory,
    aiConfidence: row.aiConfidence === null ? null : Number(row.aiConfidence.toString()),
    aiConfidenceRaw: row.aiConfidence === null ? null : row.aiConfidence.toString(),
    type: row.type as StoredReviewRow["type"],
  }));
}

/** All grouped rows for the current tenant, with 10-at-a-time pagination. */
export async function listReviewGroups(
  offset = 0,
  pageSize = REVIEW_PAGE_SIZE,
): Promise<ReviewListResult> {
  const { prisma, business } = await requireAuthContext();
  const rows = await loadLowConfidenceRows(prisma, business.id);
  const groups = groupLowConfidenceRows(rows);
  const safeOffset = Number.isFinite(offset) && offset > 0 ? Math.floor(offset) : 0;
  const safeSize = Number.isFinite(pageSize) && pageSize > 0 ? Math.floor(pageSize) : REVIEW_PAGE_SIZE;
  return {
    groups: groups.slice(safeOffset, safeOffset + safeSize),
    totalGroups: groups.length,
    totalRows: rows.length,
    totalAmount: rows.reduce((sum, row) => sum + Math.abs(Number(row.amount)), 0),
  };
}

/** Overview banner count: groups, not individual rows. */
export async function countReviewGroups(): Promise<number> {
  const { prisma, business } = await requireAuthContext();
  const rows = await loadLowConfidenceRows(prisma, business.id);
  return groupLowConfidenceRows(rows).length;
}

export interface ReviewApplyInput {
  /** "all" applies the suggestion to every remaining low-confidence row. */
  scope: "group" | "all";
  groupKey?: string;
  /** Absent/empty means accept the suggestion; otherwise a category id. */
  categoryId?: string | null;
}

export interface ReviewApplyResult {
  affected: number;
  clearedByCascade: number;
  undoToken: string;
}

function ruleDto(businessId: string, row: {
  id: string;
  matchType: string;
  pattern: string;
  categoryId: string | null;
  categoryName: string | null;
  createdAt: Date;
}): CategoryRuleDto {
  return {
    id: row.id,
    businessId,
    matchType: row.matchType === "keyword" ? "keyword" : "merchant",
    pattern: row.pattern,
    categoryId: row.categoryId,
    categoryName: row.categoryName ?? "",
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Re-run the deterministic rules categorizer over rows still in Review.
 * Newly learned merchant rules lift matching rows out of Review in one pass.
 */
export async function cascadeLearnedRules(
  prisma: PrismaClient,
  businessId: string,
): Promise<number> {
  const [rules, categories, pending] = await Promise.all([
    prisma.categoryRule.findMany({ where: { businessId } }),
    prisma.category.findMany({
      where: { OR: [{ businessId: null }, { businessId }] },
      select: { id: true, name: true },
    }),
    loadLowConfidenceRows(prisma, businessId),
  ]);

  let cleared = 0;
  for (const row of pending) {
    if (row.type === "transfer") continue;
    const match = categorizeByRules(
      row.description,
      undefined,
      rules.map((rule) => ruleDto(businessId, rule)),
      row.type === "income" ? "income" : "expense",
    );
    if (match.confidence < REVIEW_THRESHOLD || !match.categoryName) continue;
    const category = categories.find(
      (c) => c.name.trim().toLowerCase() === match.categoryName.trim().toLowerCase(),
    );
    if (!category) continue;
    await prisma.transaction.updateMany({
      where: { id: row.id, businessId },
      data: { categoryId: category.id, aiConfidence: match.confidence },
    });
    cleared += 1;
  }
  return cleared;
}

interface RuleSnapshot {
  pattern: string;
  prior: { id: string; categoryId: string | null; categoryName: string | null } | null;
  createdId: string | null;
}

/** Learn a merchant rule exactly as the single-row category edit does. */
async function learnRuleForCorrection(
  prisma: PrismaClient,
  businessId: string,
  rows: StoredReviewRow[],
  category: { id: string; name: string },
): Promise<RuleSnapshot | null> {
  const first = rows.find(
    (row) => row.aiCategory && row.type !== "transfer" && row.description,
  );
  if (!first?.aiCategory) return null;
  if (first.categoryId === category.id) return null;
  if (category.name.trim().toLowerCase() === first.aiCategory.trim().toLowerCase()) return null;

  const pattern = extractMerchantKey(first.description);
  if (!pattern) return null;

  const priorRow = await prisma.categoryRule.findFirst({
    where: { businessId, matchType: "merchant", pattern },
    select: { id: true, categoryId: true, categoryName: true },
  });
  const prior = priorRow
    ? {
        id: priorRow.id,
        categoryId: priorRow.categoryId,
        categoryName: priorRow.categoryName,
      }
    : null;

  await learnMerchantRule({
    pattern,
    categoryId: category.id,
    categoryName: category.name,
  });

  const current = await prisma.categoryRule.findFirst({
    where: { businessId, matchType: "merchant", pattern },
    select: { id: true },
  });
  return { pattern, prior, createdId: current?.id ?? null };
}

/**
 * Accept a whole group (or every remaining row) in one tenant-scoped write,
 * learning a rule for overrides, then cascading freshly learned rules over
 * the rows still waiting in Review. Returns a signed, server-issued undo
 * token capturing the exact prior state of every changed row.
 */
export async function applyReviewAction(
  input: ReviewApplyInput,
): Promise<ReviewApplyResult> {
  const { prisma, business } = await requireAuthContext();
  const rows = await loadLowConfidenceRows(prisma, business.id);
  let targets: StoredReviewRow[];

  if (input.scope === "all") {
    targets = rows;
  } else {
    if (!input.groupKey) throw new Error("Choose a review group.");
    const group = groupLowConfidenceRows(rows).find((g) => g.key === input.groupKey);
    if (!group) throw new Error("That review group is no longer available.");
    const ids = new Set(group.rows.map((row) => row.id));
    targets = rows.filter((row) => ids.has(row.id));
  }

  if (targets.length === 0) throw new Error("Nothing left to review.");

  let category: { id: string; name: string } | null = null;
  const categoryId = input.categoryId?.trim() || null;
  if (categoryId) {
    const parsed = transactionIdSchema.safeParse(categoryId);
    if (!parsed.success) throw new Error(zErrorMessage(parsed.error));
    const found = await prisma.category.findFirst({
      where: {
        id: parsed.data,
        OR: [{ businessId: null }, { businessId: business.id }],
      },
      select: { id: true, name: true, type: true },
    });
    if (!found) throw new Error("Category not found.");
    if (targets.some((row) => row.type === "transfer" || row.type !== found.type)) {
      throw new Error("Choose a category that matches every row in this group.");
    }
    category = { id: found.id, name: found.name };
  }

  const changes = targets.map((row) => ({
    id: row.id,
    categoryId: row.categoryId,
    aiConfidence: row.aiConfidenceRaw,
  }));
  const ids = targets.map((row) => row.id);

  const updated = await prisma.transaction.updateMany({
    where: { businessId: business.id, id: { in: ids } },
    data: { ...(category ? { categoryId: category.id } : {}), aiConfidence: null },
  });
  if (updated.count !== ids.length) {
    throw new Error("Some rows moved out of Review; refresh and try again.");
  }

  const rule = category ? await learnRuleForCorrection(prisma, business.id, targets, category) : null;
  const clearedByCascade = await cascadeLearnedRules(prisma, business.id);

  return {
    affected: ids.length,
    clearedByCascade,
    undoToken: signUndoToken({
      businessId: business.id,
      createdAt: Date.now(),
      changes,
      rule,
    }),
  };
}

/** Restore category + confidence for every row and remove/restore its rule. */
export async function undoReviewAction(token: string | undefined): Promise<number> {
  const payload = verifyUndoToken(token);
  if (!payload) throw new Error("This undo link has expired.");

  const { prisma, business } = await requireAuthContext();
  if (payload.businessId !== business.id) throw new Error("Not authorised to undo this review.");

  // Rows in a group usually shared one category and confidence. Batch by the
  // exact previous pair so a 135-row group needs one write, not 135 round trips.
  const batches = new Map<string, { ids: string[]; categoryId: string | null; aiConfidence: string | null }>();
  for (const change of payload.changes) {
    const key = `${change.categoryId ?? "\u0000"}::${change.aiConfidence ?? "\u0000"}`;
    const batch = batches.get(key);
    if (batch) batch.ids.push(change.id);
    else {
      batches.set(key, {
        ids: [change.id],
        categoryId: change.categoryId,
        aiConfidence: change.aiConfidence,
      });
    }
  }
  for (const batch of batches.values()) {
    await prisma.transaction.updateMany({
      where: { id: { in: batch.ids }, businessId: business.id },
      data: { categoryId: batch.categoryId, aiConfidence: batch.aiConfidence },
    });
  }

  if (payload.rule) {
    const { pattern, prior, createdId } = payload.rule;
    if (prior) {
      await prisma.categoryRule.updateMany({
        where: { id: prior.id, businessId: business.id },
        data: { categoryId: prior.categoryId, categoryName: prior.categoryName },
      });
    } else if (createdId) {
      await prisma.categoryRule.deleteMany({
        where: { id: createdId, businessId: business.id, matchType: "merchant", pattern },
      });
    }
  }

  return payload.changes.length;
}
