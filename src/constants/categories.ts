// System category taxonomy (from the blueprint). Custom categories are
// created per-business and stored in the `categories` table; the system set
// below is seeded as system defaults for every business.

export const SYSTEM_CATEGORIES = {
  income: [
    { name: "Sales", type: "income" },
    { name: "Other Income", type: "income" },
  ],
  expense: [
    { name: "Inventory", type: "expense" },
    { name: "Marketing", type: "expense" },
    { name: "Transportation", type: "expense" },
    { name: "Utilities", type: "expense" },
    { name: "Rent", type: "expense" },
    { name: "Salaries", type: "expense" },
    { name: "Software", type: "expense" },
    { name: "Banking", type: "expense" },
    { name: "Taxes", type: "expense" },
    { name: "Food", type: "expense" },
    { name: "Equipment", type: "expense" },
    { name: "Other", type: "expense" },
  ],
} as const;

export type TransactionType = "income" | "expense" | "transfer";

export const TRANSACTION_TYPES: TransactionType[] = [
  "income",
  "expense",
  "transfer",
];

export type ImportSource = "manual" | "csv" | "xlsx" | "pdf" | "bank";

export const INCOME_CATEGORIES = SYSTEM_CATEGORIES.income;
export const EXPENSE_CATEGORIES = SYSTEM_CATEGORIES.expense;
export const ALL_CATEGORIES = [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES];
