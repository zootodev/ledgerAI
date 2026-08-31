// ============================================================
// Deterministic merchant/keyword -> category rules engine
// ------------------------------------------------------------
// Categorizes transaction descriptions using deterministic rules so
// the MVP works with NO AI API key and with fully predictable,
// auditable behavior. User corrections can be folded in later by
// adding business-specific rules (the CategoryRule table) ranked above
// these defaults.
//
// Confidence heuristics:
//  - specific merchant match       -> high confidence (0.92–0.97)
//  - keyword/prefix match          -> medium (0.78–0.88)
//  - weak/generic match            -> low (<0.75) and needsReview
//  - no match                      -> "Other", low confidence, needsReview
// ============================================================

export interface MatchRule {
  /** Exact (case-insensitive) merchant token -> category. */
  merchants: Record<string, string>;
  /** Substring/keyword patterns -> category. */
  keywords: Array<{ pattern: RegExp; category: string }>;
}

const LOW_CONFIDENCE = 0.5;

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
}

/**
 * Score how "specific" a matched rule is to derive confidence.
 * Exact merchant tokens are most specific; keyword matches vary by
 * how distinctive the pattern is.
 */
export function categorizeByRules(
  description: string,
  rules: MatchRule = DEFAULT_RULES,
): RuleMatch {
  const text = description.trim();

  if (!text) {
    return { categoryName: "Other", confidence: LOW_CONFIDENCE, matched: false };
  }

  const upper = text.toUpperCase();

  // 1) Exact merchant lookup (highest specificity)
  for (const [merchant, category] of Object.entries(rules.merchants)) {
    if (upper.includes(merchant)) {
      return { categoryName: category, confidence: 0.94, matched: true };
    }
  }

  // 2) Keyword patterns (medium confidence)
  for (const entry of rules.keywords) {
    if (entry.pattern.test(text)) {
      return {
        categoryName: entry.category,
        confidence: 0.82,
        matched: true,
      };
    }
  }

  // 3) No reliable match -> "Other" + needsReview
  return { categoryName: "Other", confidence: LOW_CONFIDENCE, matched: false };
}

/** Threshold below which a categorization should be flagged for review. */
export const REVIEW_THRESHOLD = 0.75;
