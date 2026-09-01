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