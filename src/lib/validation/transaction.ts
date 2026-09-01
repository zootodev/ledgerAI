import { z } from "zod";

export const TRANSACTION_TYPES = ["income", "expense", "transfer"] as const;
export const TRANSACTION_TYPE_LABELS: Record<(typeof TRANSACTION_TYPES)[number], string> = {
  income: "Income",
  expense: "Expense",
  transfer: "Transfer",
};

const optionalNickname = z
  .string()
  .trim()
  .max(120)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9 _.-]*$/, "Use letters, numbers, spaces, dots, dashes.")
  .nullable()
  .optional()
  .transform((v) => (v === "" ? null : v));

// Server-side authoritative schema for creating/updating transactions.
// Amount stays a STRING ("250.50") so no floating-point conversion happens at
// the boundary; it is stored as Postgres `numeric` and formatted by the
// deterministic finance engine.
export const transactionInputSchema = z
  .object({
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date (YYYY-MM-DD).")
      .refine((v) => {
        const d = new Date(`${v}T00:00:00.000Z`);
        return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
      }, "That date is not valid."),
    description: z
      .string()
      .trim()
      .min(1, "Description is required.")
      .max(200, "Description must be 200 characters or fewer."),
    amount: z
      .string()
      .regex(/^\d+(\.\d{1,2})?$/, "Enter an amount, e.g. 2500 or 2500.00."),
    type: z.enum(TRANSACTION_TYPES),
    accountId: z.uuid().nullable().optional(),
    categoryId: z.uuid().nullable().optional(),
    reference: z
      .string()
      .trim()
      .max(100, "Reference must be 100 characters or fewer.")
      .nullable()
      .optional()
      .transform((v) => (v === "" ? null : v)),
    notes: z
      .string()
      .trim()
      .max(500, "Notes must be 500 characters or fewer.")
      .nullable()
      .optional()
      .transform((v) => (v === "" ? null : v)),
  })
  .superRefine((data, ctx) => {
    if (data.amount === "0" || data.amount === "0.00") {
      ctx.addIssue({
        code: "custom",
        path: ["amount"],
        message: "Amount must be greater than zero.",
      });
    }
  });

export const transactionIdSchema = z.uuid("Invalid transaction id.");

/** Sort keys the transactions list accepts. */
export const TRANSACTION_SORT_KEYS = ["date", "amount", "description", "createdAt"] as const;

export const transactionListQuerySchema = z.object({
  page: z.coerce
    .number()
    .int()
    .default(1)
    .transform((v) => Math.max(1, v)),
  pageSize: z.coerce
    .number()
    .int()
    .default(20)
    .transform((v) => Math.min(100, Math.max(1, v))),
  search: z.string().trim().max(100).optional(),
  type: z.enum(TRANSACTION_TYPES).optional(),
  accountId: z.uuid().optional(),
  categoryId: z.uuid().optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  sortBy: z.enum(TRANSACTION_SORT_KEYS).default("date"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});

export type TransactionInput = z.infer<typeof transactionInputSchema>;
export type TransactionListQuery = z.infer<typeof transactionListQuerySchema>;

export { optionalNickname };