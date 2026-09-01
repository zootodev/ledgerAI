export { transactionInputSchema, transactionIdSchema, transactionListQuerySchema } from "./transaction";
export type { TransactionInput, TransactionListQuery } from "./transaction";
export { accountInputSchema, accountIdSchema } from "./account";
export type { AccountInput } from "./account";
export { categoryInputSchema, categoryIdSchema, categoryTypeSchema } from "./category";
export type { CategoryInput } from "./category";
export { businessUpdateSchema } from "./business";
export type { BusinessUpdateInput } from "./business";
export {
  analyticsQuerySchema,
  analyticsTrendsQuerySchema,
  ANALYTICS_GROUP_BY,
} from "./analytics";
export type { AnalyticsQuery, AnalyticsTrendsQuery } from "./analytics";

/**
 * Summarize Zod issues into a single human-readable error string.
 * Only the first issue is surfaced to keep messages short and actionable.
 */
export function zErrorMessage(error: {
  issues: ReadonlyArray<{ readonly path: ReadonlyArray<string | number | symbol>; readonly message: string }>;
}): string {
  const first = error.issues[0];
  if (!first) return "Invalid input.";
  const field = first.path.length > 0 ? ` (${String(first.path[0])})` : "";
  return `${first.message}${field}`;
}