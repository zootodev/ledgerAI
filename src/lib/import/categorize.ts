// ============================================================
// LedgerAI — Import categorization
// ------------------------------------------------------------
// Wraps the deterministic AI service (rules-based, no API key) for
// import suggestions. Order of preference for a suggested category:
//
//   1. Transfer rows          -> no category ("Transfer" sentinel).
//   2. File category text     -> trusted (the file already says so).
//   3. Rules categorization   -> AI on the normalized description.
//
// Business-scoped learned rules (CategoryRule rows) are resolved against
// the business's current categories BEFORE they reach the engine, so the
// engine only ever emits a resolvable target and preview/commit agree
// even after a category rename or delete.
//
// Categorization is suggestions only — the review step and the commit
// layer remain the source of truth.
// ============================================================

import { getAIService } from "@/lib/ai/provider";
import { categoryMatchesRowType } from "@/lib/ai/rules";
import type { CategoryRuleDto } from "../../types";
import { matchDictionary } from "./merchant-dictionary";
import type {
  ImportCategoryOption,
  ImportSuggestion,
  NormalizedImportRow,
} from "./types";

const TRANSFER_CATEGORY = "Transfer";
const FILE_CATEGORY_CONFIDENCE = 0.9;

/**
 * The deterministic fallback name for an unmatched row of a given type.
 * The rules engine only knows the expense "Other"; income rows must surface
 * as "Other Income" so the review label matches what the commit layer
 * resolves. Preview and commit both derive the fallback from here.
 */
export function fallbackCategoryName(type: unknown): string {
  return type === "income" ? "Other Income" : "Other";
}

export interface CategorizeOptions {
  /** Business-scoped learned rules (ranked above the built-in defaults). */
  businessRules?: CategoryRuleDto[];
  /** The business's current categories, used to resolve rule targets. */
  categoryOptions?: ImportCategoryOption[];
}

export async function categorizeImportRow(
  row: NormalizedImportRow,
  options: CategorizeOptions = {},
): Promise<ImportSuggestion> {
  if (row.type === "transfer") {
    return {
      categoryName: TRANSFER_CATEGORY,
      confidence: 1,
      needsReview: false,
      reason: row.transfer?.reason ?? "transfer row",
    };
  }

  if (row.category) {
    return {
      categoryName: row.category,
      confidence: FILE_CATEGORY_CONFIDENCE,
      needsReview: false,
      reason: "category from the file",
    };
  }

  const resolvedRules = resolveRulesForRow(
    options.businessRules,
    row.type,
    options.categoryOptions,
  );
  const { categorizer } = getAIService({ categoryRules: resolvedRules });
  const result = await categorizer.categorize(row.description, row.type);

  // A learned correction always wins. If the engine did not use a learned
  // rule, the Nigerian keyword dictionary is more specific than the built-in
  // defaults and explains itself.
  if (result.businessRule) {
    return {
      categoryName: result.categoryName,
      confidence: result.confidence,
      needsReview: result.needsReview,
      businessRule: result.businessRule,
      reason: `learned rule for "${result.businessRule.categoryName}"`,
    };
  }

  const dictionary = matchDictionary(row.description, row.type);
  if (dictionary) {
    return {
      categoryName: dictionary.categoryName,
      confidence: dictionary.confidence,
      needsReview: dictionary.needsReview,
      reason: dictionary.reason,
    };
  }

  const fallbackName =
    row.type === "income" && result.categoryName === "Other"
      ? fallbackCategoryName("income")
      : result.categoryName;
  return {
    categoryName: fallbackName,
    confidence: result.confidence,
    needsReview: result.needsReview,
    businessRule: result.businessRule,
    reason:
      result.confidence >= 0.7
        ? "matched the built-in keyword rules"
        : "no strong keyword match",
  };
}

export async function categorizeImportRows(
  rows: NormalizedImportRow[],
  options: CategorizeOptions = {},
): Promise<Map<number, ImportSuggestion>> {
  const suggestions = new Map<number, ImportSuggestion>();
  await Promise.all(
    rows.map(async (row) => {
      suggestions.set(row.rowIndex, await categorizeImportRow(row, options));
    }),
  );
  return suggestions;
}

/** Case-insensitive name lookup within a type bucket. */
export function matchByName(
  options: ImportCategoryOption[],
  name: string,
  type: "income" | "expense",
): ImportCategoryOption | null {
  const target = name.trim().toLowerCase();
  return (
    options.find((o) => o.type === type && o.name.trim().toLowerCase() === target) ?? null
  );
}

/**
 * Resolve learned rules against the business's CURRENT categories for one
 * row type before they reach the engine:
 *
 *   - categoryId present and still owned/resolvable  -> keep, rewrite the
 *     target name to today's name (survives a category RENAME).
 *   - else categoryName matching a current category  -> keep (recreated/renamed).
 *   - else                                            -> drop the rule, so the
 *     engine falls through to the built-in defaults and never emits an
 *     unresolvable target.
 */
export function resolveRulesForRow(
  rules: CategoryRuleDto[] | undefined,
  rowType: "income" | "expense" | "transfer",
  categories?: ImportCategoryOption[],
): CategoryRuleDto[] | undefined {
  if (!rules || rules.length === 0) return rules;
  if (!categories) return rules;

  const options = categories.filter(
    (c) =>
      (rowType === "income" || rowType === "expense") &&
      categoryMatchesRowType(c.type, rowType),
  );
  const resolved: CategoryRuleDto[] = [];
  for (const rule of rules) {
    const target = resolveRuleTarget(rule, options, rowType);
    if (target) resolved.push(target);
  }
  return resolved;
}

function resolveRuleTarget(
  rule: CategoryRuleDto,
  options: ImportCategoryOption[],
  targetRowType: "income" | "expense" | "transfer",
): CategoryRuleDto | null {
  if (rule.categoryId) {
    const byId = options.find(
      (o) => o.id === rule.categoryId && categoryMatchesRowType(o.type, targetRowType),
    );
    if (byId) {
      return { ...rule, categoryId: byId.id, categoryName: byId.name };
    }
  }
  if (rule.categoryName) {
    const byName = options.find(
      (o) =>
        categoryMatchesRowType(o.type, targetRowType) &&
        o.name.trim().toLowerCase() === rule.categoryName.trim().toLowerCase(),
    );
    if (byName) {
      return { ...rule, categoryId: byName.id, categoryName: byName.name };
    }
  }
  return null;
}