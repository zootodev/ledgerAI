import type { Categorizer } from "./types";
import type { CategorizationResult } from "../../types";
import { categorizeByRules, REVIEW_THRESHOLD } from "./rules";

/**
 * Deterministic rules-based categorizer. Implements the Categorizer
 * interface so it is a drop-in for the provider abstraction. Never uses
 * an LLM and never performs financial math.
 */
export class RulesCategorizer implements Categorizer {
  async categorize(description: string): Promise<CategorizationResult> {
    const { categoryName, confidence, matched } = categorizeByRules(description);
    const needsReview = !matched || confidence < REVIEW_THRESHOLD;
    return { categoryName, confidence, needsReview };
  }
}
