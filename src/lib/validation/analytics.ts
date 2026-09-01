import { z } from "zod";

/**
 * Query params for analytics KPIs. Dates use the same YYYY-MM-DD convention
 * as the transaction list so a shared date-range control stays consistent.
 */
export const analyticsQuerySchema = z.object({
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;