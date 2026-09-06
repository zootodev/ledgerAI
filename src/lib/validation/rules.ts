import { z } from "zod";

export const categoryRuleMatchTypeSchema = z.enum(
  ["merchant", "keyword"] as const,
  "Rule match type must be merchant or keyword.",
);

export const categoryRulePatternSchema = z
  .string()
  .trim()
  .min(1, "Rule pattern is required.")
  .max(100, "Rule pattern must be 100 characters or fewer.");

export const categoryRuleIdSchema = z.uuid("Invalid rule id.");

/** The validated matter of a rule: what to learn and its target category. */
export interface CategoryRuleLearnInput {
  matchType: "merchant" | "keyword";
  pattern: string;
  categoryId: string | null;
  categoryName: string;
}

export const categoryRuleLearnInputSchema: z.ZodType<CategoryRuleLearnInput> = z.object({
  matchType: categoryRuleMatchTypeSchema,
  pattern: categoryRulePatternSchema,
  categoryId: z.uuid("Invalid category id.").nullable(),
  categoryName: z.string().trim().min(1, "Category name is required."),
});