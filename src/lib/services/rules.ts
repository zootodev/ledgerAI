import { requireAuthContext } from "@/lib/services/auth-context";
import {
  categoryRuleIdSchema,
  categoryRuleLearnInputSchema,
  categoryRuleMatchTypeSchema,
  type CategoryRuleLearnInput,
} from "@/lib/validation/rules";
import { zErrorMessage } from "@/lib/validation/index";
import type { PrismaClient } from "@/generated/prisma/client";
import type { CategoryRuleModel } from "@/generated/prisma/models/CategoryRule";
import type { CategoryRuleDto } from "@/types";

/**
 * Validate a raw match-type string, used at the action boundary and by the
 * learning flows to guarantee only merchant|keyword is ever written.
 */
export function isCategoryRuleMatchType(value: unknown): value is "merchant" | "keyword" {
  return categoryRuleMatchTypeSchema.safeParse(value).success;
}

/** List the current business's learned category rules, newest first. */
export async function listCategoryRules(): Promise<CategoryRuleDto[]> {
  const { prisma, business } = await requireAuthContext();
  const rules = await prisma.categoryRule.findMany({
    where: { businessId: business.id },
    orderBy: { createdAt: "desc" },
  });
  return rules.map(toDto);
}

/**
 * Delete a rule owned by the current business. Returns false for unknown or
 * foreign ids so callers can silently ignore attempts to touch another
 * tenant's data.
 */
export async function deleteCategoryRule(id: string): Promise<boolean> {
  const idParsed = categoryRuleIdSchema.safeParse(id);
  if (!idParsed.success) return false;

  const { prisma, business } = await requireAuthContext();
  const existing = await prisma.categoryRule.findFirst({
    where: { id: idParsed.data, businessId: business.id },
    select: { id: true },
  });
  if (!existing) return false;

  await prisma.categoryRule.delete({ where: { id: existing.id } });
  return true;
}

/**
 * Learn (upsert) a single merchant rule for the current business. Thin
 * convenience wrapper around persistLearnedRules for the manual-edit path.
 * Best-effort: a failure never throws to the caller.
 */
export async function learnMerchantRule(input: {
  pattern: string;
  categoryId: string | null;
  categoryName: string;
}): Promise<number> {
  return persistLearnedRules(
    [{ matchType: "merchant", pattern: input.pattern, categoryId: input.categoryId, categoryName: input.categoryName }],
    "edit",
  );
}

/**
 * Persist learned category rules best-effort.
 *
 * Each candidate is validated and ownership-checked (the category must be a
 * system category or owned by the current business), then upserted on the
 * (businessId, matchType, pattern) unique key. Every rule is handled inside
 * its own try/catch so a single failure never aborts the batch, and the call
 * is deliberately NOT wrapped in a financial transaction — learning must
 * never roll back or block the import/manual edit that triggered it.
 *
 * @param candidates Validated rule intents for this business.
 * @param origin Short context string for error logging (e.g. "import", "edit").
 * @returns The number of rules successfully written/updated.
 */
export async function persistLearnedRules(
  candidates: CategoryRuleLearnInput[],
  origin: string,
): Promise<number> {
  if (candidates.length === 0) return 0;

  const { prisma, business } = await requireAuthContext();
  let count = 0;
  for (const candidate of candidates) {
    const parsed = categoryRuleLearnInputSchema.safeParse(candidate);
    if (!parsed.success) {
      console.error(
        `[rules] ${origin}: skipped invalid rule`,
        { pattern: candidate.pattern, error: zErrorMessage(parsed.error) },
      );
      continue;
    }

    if (parsed.data.categoryId) {
      const allowed = await categoryBelongsToBusiness(prisma, business.id, parsed.data.categoryId);
      if (!allowed) {
        console.error(
          `[rules] ${origin}: skipped rule with unowned category`,
          { pattern: parsed.data.pattern, categoryId: parsed.data.categoryId },
        );
        continue;
      }
    }

    try {
      await upsertRule(prisma, business.id, parsed.data);
      count += 1;
    } catch (err) {
      console.error(
        `[rules] ${origin}: failed to persist rule`,
        { pattern: parsed.data.pattern, category: parsed.data.categoryName, error: String(err) },
      );
    }
  }
  return count;
}

async function upsertRule(
  prisma: PrismaClient,
  businessId: string,
  input: CategoryRuleLearnInput,
): Promise<void> {
  await prisma.categoryRule.upsert({
    where: {
      businessId_matchType_pattern: {
        businessId,
        matchType: input.matchType,
        pattern: input.pattern,
      },
    },
    update: {
      categoryId: input.categoryId,
      categoryName: input.categoryName,
    },
    create: {
      businessId,
      matchType: input.matchType,
      pattern: input.pattern,
      categoryId: input.categoryId,
      categoryName: input.categoryName,
    },
  });
}

/** True when the category exists and is owned by the business or system-wide. */
async function categoryBelongsToBusiness(
  prisma: PrismaClient,
  businessId: string,
  categoryId: string,
): Promise<boolean> {
  const category = await prisma.category.findFirst({
    where: {
      id: categoryId,
      OR: [{ businessId: null }, { businessId }],
    },
    select: { id: true },
  });
  return category !== null;
}

function toDto(rule: CategoryRuleModel): CategoryRuleDto {
  return {
    id: rule.id,
    businessId: rule.businessId,
    matchType: rule.matchType as CategoryRuleDto["matchType"],
    pattern: rule.pattern,
    categoryId: rule.categoryId,
    categoryName: rule.categoryName ?? "",
    createdAt: rule.createdAt.toISOString(),
  };
}