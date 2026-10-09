"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { updateBusiness } from "@/lib/services/business";
import {
  BUSINESS_SIZES,
  BUSINESS_TYPES,
  COUNTRIES,
  CURRENCIES,
} from "@/lib/validation/business";
import {
  businessUpdateSchema,
  zErrorMessage,
} from "@/lib/validation/index";

export interface OnboardingActionState {
  error?: string;
}

/**
 * Onboarding requires a name, a business type, a country and a currency —
 * `type` is what marks the profile as "set up" (it is null on
 * auto-provisioned businesses), so it must be present to finish.
 */
const onboardingSchema = z.object({
  name: businessUpdateSchema.shape.name,
  type: z.enum(BUSINESS_TYPES, "Choose what your business does."),
  country: z.enum(COUNTRIES, "Choose a country."),
  currency: z.enum(CURRENCIES, "Choose a currency."),
  size: z.enum(BUSINESS_SIZES).nullable().optional(),
  goals: z
    .array(z.string().trim().min(1).max(200))
    .max(10)
    .default([]),
});

/** Goals arrive as newline/comma-separated text and become a clean list. */
function parseGoals(raw: string): string[] {
  return raw
    .split(/\r?\n|,/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * Finish onboarding: validate the two-step form, save the business profile,
 * and continue to the dashboard. `redirect` is deliberately outside the
 * try/catch — Next.js implements it by throwing.
 */
export async function completeOnboardingAction(
  _prev: OnboardingActionState,
  formData: FormData,
): Promise<OnboardingActionState> {
  const parsed = onboardingSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    type: String(formData.get("type") ?? ""),
    country: String(formData.get("country") ?? ""),
    currency: String(formData.get("currency") ?? ""),
    size: String(formData.get("size") ?? "") || null,
    goals: parseGoals(String(formData.get("goals") ?? "")),
  });

  if (!parsed.success) {
    return { error: zErrorMessage(parsed.error) };
  }

  try {
    await updateBusiness(parsed.data);
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Unable to save your business details.",
    };
  }

  redirect("/overview");
}
