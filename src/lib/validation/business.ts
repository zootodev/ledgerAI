import { z } from "zod";

export const COUNTRIES = [
  "NG",
  "GH",
  "KE",
  "ZA",
  "US",
  "GB",
  "CA",
] as const;

/** Human-readable labels for COUNTRIES codes (kept in sync; codes stay canonical). */
export const COUNTRY_LABELS: Record<(typeof COUNTRIES)[number], string> = {
  NG: "Nigeria",
  GH: "Ghana",
  KE: "Kenya",
  ZA: "South Africa",
  US: "United States",
  GB: "United Kingdom",
  CA: "Canada",
};

export const CURRENCIES = [
  "NGN",
  "GHS",
  "KES",
  "ZAR",
  "USD",
  "GBP",
  "CAD",
] as const;

export const BUSINESS_TYPES = [
  "Retail",
  "E-commerce",
  "Services",
  "Food & Beverage",
  "Fashion",
  "Freelance",
  "Agency",
  "Other",
] as const;

export const BUSINESS_SIZES = ["1-5", "6-20", "21-50", "50+"] as const;

export const businessUpdateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Business name is required.")
    .max(120, "Business name must be 120 characters or fewer."),
  type: z.enum(BUSINESS_TYPES).nullable().optional(),
  country: z.enum(COUNTRIES).default("NG"),
  currency: z.enum(CURRENCIES).default("NGN"),
  size: z.enum(BUSINESS_SIZES).nullable().optional(),
  goals: z.array(z.string().trim().max(200)).max(10).default([]),
});

export type BusinessUpdateInput = z.infer<typeof businessUpdateSchema>;