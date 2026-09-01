import { z } from "zod";

export const categoryTypeSchema = z.enum(
  ["income", "expense"] as const,
  "Category type must be income or expense.",
);

export const categoryInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Category name is required.")
    .max(60, "Category name must be 60 characters or fewer."),
  type: categoryTypeSchema,
});

export const categoryIdSchema = z.uuid("Invalid category id.");

export type CategoryInput = z.infer<typeof categoryInputSchema>;