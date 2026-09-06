import type { Categorizer } from "./types";
import type { CategorizationResult, CategoryRuleDto } from "../../types";
import { categorizeByRules, REVIEW_THRESHOLD } from "./rules";

export interface RulesCategorizerOptions {
  /** Business-scoped learned rules, ranked above the built-in defaults. */
  businessRules?: CategoryRuleDto[];
}

/**
 * Deterministic rules-based categorizer. Implements the Categorizer
 * interface so it is a drop-in for the provider abstraction. Never uses
 * an LLM and never performs financial math.
 */
export class RulesCategorizer implements Categorizer {
  private readonly businessRules?: CategoryRuleDto[];

  constructor(options: RulesCategorizerOptions = {}) {
    this.businessRules = options.businessRules;
  }

  async categorize(
    description: string,
    rowType?: "income" | "expense",
  ): Promise<CategorizationResult> {
    const { categoryName, confidence, matched, businessRule } = categorizeByRules(
      description,
      undefined,
      this.businessRules,
      rowType,
    );
    const needsReview = !matched || confidence < REVIEW_THRESHOLD;
    return { categoryName, confidence, needsReview, businessRule };
  }
}