// ============================================================
// Deterministic merchant/keyword -> category rules engine
// ------------------------------------------------------------
// Categorizes transaction descriptions using deterministic rules so
// the MVP works with NO AI API key and with fully predictable,
// auditable behavior. Business-specific learned rules (the CategoryRule
// table) are ranked ABOVE these defaults.
//
// Confidence heuristics:
//  - specific merchant match       -> high confidence (0.92–0.97)
//  - keyword/prefix match          -> medium (0.78–0.88)
//  - weak/generic match            -> low (<0.75) and needsReview
//  - no match                      -> "Other", low confidence, needsReview
// ============================================================

import type { CategoryRuleDto } from "../../types";

export interface MatchRule {
  /** Exact (case-insensitive) merchant token -> category. */
  merchants: Record<string, string>;
  /** Substring/keyword patterns -> category. */
  keywords: Array<{ pattern: RegExp; category: string }>;
}

const LOW_CONFIDENCE = 0.5;

/**
 * The category TYPE of every built-in default target. All built-in rules map
 * to expense categories; income rows must never be suggested an expense
 * category, so a built-in match is gated on `categoryMatchesRowType`.
 */
export const DEFAULT_CATEGORY_TYPES: Readonly<Record<string, "income" | "expense">> = {
  Transportation: "expense",
  Banking: "expense",
  Utilities: "expense",
  Other: "expense",
  Marketing: "expense",
  Inventory: "expense",
  Rent: "expense",
  Salaries: "expense",
  Software: "expense",
  Taxes: "expense",
  Food: "expense",
  Equipment: "expense",
};

/**
 * Whether a category's type matches the row's type. When the row type is
 * unknown (undefined) the check is skipped so legacy/direct callers that do
 * not supply a row type keep the previous behavior. A transfer row never
 * matches a category.
 */
export function categoryMatchesRowType(
  categoryType: "income" | "expense" | undefined,
  rowType: "income" | "expense" | "transfer" | undefined,
): boolean {
  if (rowType === undefined) return true;
  if (rowType === "transfer") return false;
  if (categoryType === undefined) return true;
  return categoryType === rowType;
}

const DEFAULT_RULES: MatchRule = {
  merchants: {
    UBER: "Transportation",
    BOLT: "Transportation",
    "GTBANK TRANSFER": "Banking",
    "ACCESS BANK": "Banking",
    "ZENITH BANK": "Banking",
    "OPAY TRANSFER": "Banking",
    "PALMPAY TRANSFER": "Banking",
    "MONIEPOINT TRANSFER": "Banking",
    "PAYSTACK TRANSFER": "Banking",
    MTN: "Utilities",
    AIRTEL: "Utilities",
    GLO: "Utilities",
    "9MOBILE": "Utilities",
    "$": "Other",
  },
  keywords: [
    { pattern: /\btransport\b|\bbolt\b|\buber\b|\btaxi\b/i, category: "Transportation" },
    { pattern: /\badvert\b|\bmarketing\b|\bads\b|\bsocial media\b/i, category: "Marketing" },
    { pattern: /\binstagr(am)?\b|\bfacebook\b/i, category: "Marketing" },
    { pattern: /\binventory\b|\bsupplier\b|\bwholesale\b/i, category: "Inventory" },
    { pattern: /\brent\b|\blease\b/i, category: "Rent" },
    { pattern: /\bsalary\b|\bsalary\b|\bstaff\b/i, category: "Salaries" },
    { pattern: /\bsoftware\b|\bsubscription\b|\bsaas\b|\bnetflix\b|\bspotify\b/i, category: "Software" },
    { pattern: /\belectric(ity)?\b|\bwater\b|\bpower\b|\bdata\b|\brecharge\b/i, category: "Utilities" },
    { pattern: /\bbank\b|\btransfer\b|\bfee\b|\bcharges\b/i, category: "Banking" },
    { pattern: /\btax\b|\bfir\b|\bvat\b/i, category: "Taxes" },
    { pattern: /\bfood\b|\brestaurant\b|\bcafe\b|\bgrocery\b|\bprovision\b/i, category: "Food" },
    { pattern: /\bequipment\b|\bmachine\b|\btool\b|\bdevice\b/i, category: "Equipment" },
  ],
};

export interface RuleMatch {
  categoryName: string;
  confidence: number;
  matched: boolean;
  /** Set when the match came from a learned business rule. */
  businessRule?: {
    categoryId: string | null;
    categoryName: string;
  } | null;
}

/**
 * Rank business rules for deterministic matching: longest pattern first,
 * then oldest createdAt, then id (all ascending aside from length).
 */
function orderedBusinessRules(
  rules: CategoryRuleDto[] | undefined,
  type: CategoryRuleDto["matchType"],
): CategoryRuleDto[] {
  if (!rules) return [];
  return rules
    .filter((r) => r.matchType === type)
    .sort(
      (a, b) =>
        b.pattern.length - a.pattern.length ||
        a.createdAt.localeCompare(b.createdAt) ||
        a.id.localeCompare(b.id),
    );
}

function safeRuleRegex(pattern: string | undefined): RegExp | null {
  if (!pattern) return null;
  try {
    return new RegExp(pattern, "i");
  } catch {
    return null;
  }
}

/**
 * Score how "specific" a matched rule is to derive confidence.
 * Exact merchant tokens are most specific; keyword matches vary by
 * how distinctive the pattern is.
 */
export function categorizeByRules(
  description: string,
  rules: MatchRule = DEFAULT_RULES,
  businessRules?: CategoryRuleDto[],
  rowType?: "income" | "expense",
): RuleMatch {
  const text = description.trim();

  if (!text) {
    return { categoryName: "Other", confidence: LOW_CONFIDENCE, matched: false };
  }

  const upper = text.toUpperCase();

  // 1) Business (learned) merchant rules — highest specificity. Beat a
  //    conflicting built-in merchant rule by being consulted first.
  for (const rule of orderedBusinessRules(businessRules, "merchant")) {
    if (rule.pattern && upper.includes(rule.pattern)) {
      return {
        categoryName: rule.categoryName || "Other",
        confidence: 0.94,
        matched: true,
        businessRule: { categoryId: rule.categoryId, categoryName: rule.categoryName },
      };
    }
  }

  // 2) Business keyword rules.
  for (const rule of orderedBusinessRules(businessRules, "keyword")) {
    const re = safeRuleRegex(rule.pattern);
    if (re && re.test(text)) {
      return {
        categoryName: rule.categoryName || "Other",
        confidence: 0.82,
        matched: true,
        businessRule: { categoryId: rule.categoryId, categoryName: rule.categoryName },
      };
    }
  }

  // 3) Built-in exact merchant lookup.
  for (const [merchant, category] of Object.entries(rules.merchants)) {
    if (!categoryMatchesRowType(DEFAULT_CATEGORY_TYPES[category], rowType)) continue;
    if (upper.includes(merchant)) {
      return { categoryName: category, confidence: 0.94, matched: true };
    }
  }

  // 4) Built-in keyword patterns (medium confidence).
  for (const entry of rules.keywords) {
    if (!categoryMatchesRowType(DEFAULT_CATEGORY_TYPES[entry.category], rowType)) continue;
    if (entry.pattern.test(text)) {
      return {
        categoryName: entry.category,
        confidence: 0.82,
        matched: true,
      };
    }
  }

  // 5) No reliable match -> "Other" + needsReview
  return { categoryName: "Other", confidence: LOW_CONFIDENCE, matched: false };
}

/** Threshold below which a categorization should be flagged for review. */
export const REVIEW_THRESHOLD = 0.75;
