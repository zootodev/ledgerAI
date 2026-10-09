import { z } from "zod";
import { IMPORT_FIELDS, REQUIRED_IMPORT_FIELDS } from "@/lib/import/types";

/**
 * Column mapping schema. Only known LedgerAI fields are accepted; header
 * values are plain strings. Required fields and the amount scheme (an
 * `amount` column OR a debit/credit pair) are enforced here so any commit
 * payload that does not describe a parseable statement is rejected.
 */
export const importMappingSchema = z
  .object(
    Object.fromEntries(
      IMPORT_FIELDS.map((field) => [field, z.string().trim().min(1).max(80).optional()]),
    ) as Record<(typeof IMPORT_FIELDS)[number], z.ZodOptional<z.ZodString>>,
  )
  .refine(
    (m) =>
      REQUIRED_IMPORT_FIELDS.every(
        (field) => typeof m[field] === "string" && m[field].trim() !== "",
      ),
    { message: "Column mapping is missing a required field (Date and Description)." },
  )
  .refine((m) => m.amount || m.debit || m.credit, {
    message: "Column mapping is missing an amount source (Amount, or Debit/Credit).",
  });

export type ImportMappingInput = z.infer<typeof importMappingSchema>;

export const importCommitSelectionRowSchema = z.object({
  rowIndex: z.number().int().min(0),
  include: z.boolean(),
  // Explicit per-row "Import anyway" opt-in for rows that already exist in
  // the ledger. Absent/false is the safe default: the server only commits
  // an existing duplicate when this flag is true (re-validated here).
  importAnyway: z.boolean().optional(),
  categoryId: z.uuid().nullable(),
});

export const importCommitInputSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  fileType: z.enum(["csv", "xlsx", "pdf"]),
  mapping: importMappingSchema,
  accountId: z.uuid().nullable().optional(),
  selections: z
    .array(importCommitSelectionRowSchema)
    .max(5000, "Too many rows. Split the file and import in batches.")
    .default([]),
});

export type ImportCommitInput = z.infer<typeof importCommitInputSchema>;