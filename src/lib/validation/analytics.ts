import { z } from "zod";

/** Supported trend bucket granularities. */
export const ANALYTICS_GROUP_BY = ["day", "month"] as const;

const dateField = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date (YYYY-MM-DD).")
  .refine((v) => {
    const d = new Date(`${v}T00:00:00.000Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, "That date is not valid.");

/** A shared date range must always be ordered (inclusive bounds). */
function assertDatesOrdered(
  data: { dateFrom?: string; dateTo?: string },
  ctx: z.RefinementCtx,
): void {
  if (data.dateFrom && data.dateTo && data.dateFrom > data.dateTo) {
    ctx.addIssue({
      code: "custom",
      path: ["dateFrom"],
      message: "From date must not be after the to date.",
    });
  }
}

/**
 * Query params for analytics KPIs. Dates use the same YYYY-MM-DD convention
 * as the transaction list so a shared date-range control stays consistent.
 */
export const analyticsQuerySchema = z
  .object({
    dateFrom: dateField.optional(),
    dateTo: dateField.optional(),
  })
  .superRefine(assertDatesOrdered);

/** Query params for analytics trend charts (day/month buckets). */
export const analyticsTrendsQuerySchema = z
  .object({
    dateFrom: dateField.optional(),
    dateTo: dateField.optional(),
    groupBy: z.enum(ANALYTICS_GROUP_BY).default("month"),
  })
  .superRefine(assertDatesOrdered);

export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;
export type AnalyticsTrendsQuery = z.infer<typeof analyticsTrendsQuerySchema>;