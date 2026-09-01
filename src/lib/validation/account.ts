import { z } from "zod";
import { CURRENCIES } from "@/lib/validation/business";

export const accountInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Account name is required.")
    .max(80, "Account name must be 80 characters or fewer."),
  institution: z
    .string()
    .trim()
    .max(80, "Institution must be 80 characters or fewer.")
    .optional()
    .nullable()
    .transform((v) => (v === "" ? null : v)),
  currency: z
    .string()
    .trim()
    .default("NGN")
    .transform((v) => v.toUpperCase())
    .pipe(z.enum(CURRENCIES, "Use a supported currency code.")),
});

export const accountIdSchema = z.uuid("Invalid account id.");

export type AccountInput = z.infer<typeof accountInputSchema>;