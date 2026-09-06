import { requireAuthContext } from "@/lib/services/auth-context";
import type { ImportCommitInput } from "@/lib/validation/import";
import {
  normalizeImportRow,
  parseCsv,
  parseXlsx,
  tagDuplicates,
  fingerprintOf,
  validateMapping,
  categorizeImportRow,
} from "@/lib/import/index";
import { canonicalAmount } from "@/lib/import/dedupe";
import type {
  ImportCategoryOption,
  ImportSuggestion,
  NormalizedImportRow,
} from "@/lib/import/types";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import type { ImportModel } from "@/generated/prisma/models/Import";

// ============================================================
// LedgerAI — Import service
// ------------------------------------------------------------
// The commit path is stateless and self-sufficient: given the original
// file bytes plus the user's mapping/account/selections, EVERY row is
// re-parsed, re-normalized, re-validated, re-deduped and re-categorized
// here. It therefore needs no intermediate state and cannot be tricked
// by a stale or forged preview.
// ============================================================

export interface ImportHistoryItem {
  id: string;
  filename: string;
  fileType: string;
  status: string;
  transactionsFound: number;
  transactionsImported: number;
  errors: {
    invalidRows: number;
    errors: unknown[];
    existingDuplicates: number;
    inFileDuplicates: number;
    excluded: number;
  } | null;
  createdAt: string;
  completedAt: string | null;
}

export interface ImportCommitServiceResult {
  total: number;
  imported: number;
  existingDuplicates: number;
  inFileDuplicates: number;
  invalid: number;
  excluded: number;
  importId: string;
}

export type { ImportCommitInput };

/**
 * List recent import runs for the current business, newest first.
 */
export async function listImportHistory(limit = 20): Promise<ImportHistoryItem[]> {
  const { prisma, business } = await requireAuthContext();
  const imports = await prisma.import.findMany({
    where: { businessId: business.id },
    orderBy: { createdAt: "desc" },
    take: Math.max(1, Math.min(limit, 100)),
  });
  return imports.map(toHistoryDto);
}

/**
 * Compile the set of canonical fingerprints already present for the current
 * business. Amounts are canonicalized to two decimals so an import that says
 * "1250.50" matches a manual transaction recorded as "1250.5".
 */
export async function getExistingFingerprints(): Promise<string[]> {
  const { prisma, business } = await requireAuthContext();
  const rows = await prisma.transaction.findMany({
    where: { businessId: business.id },
    select: { date: true, type: true, description: true, amount: true, reference: true },
  });
  const { transactionFingerprint } = await import("@/lib/finance/engine");
  const set = new Set<string>();
  for (const row of rows) {
    set.add(
      transactionFingerprint({
        date: row.date.toISOString().slice(0, 10),
        type: row.type as "income" | "expense" | "transfer",
        description: row.description,
        amount: canonicalAmount(row.amount.toString()),
        reference: row.reference,
      }),
    );
  }
  return [...set];
}

/**
 * Commit a prepared import. Every row is re-derived from the file bytes and
 * the user's decisions; only valid, included, genuinely-new rows are written.
 * The import ledger row and the transactions land in a single DB transaction.
 */
export async function commitImport(
  fileBytes: Uint8Array,
  input: ImportCommitInput,
): Promise<ImportCommitServiceResult> {
  const { prisma, business } = await requireAuthContext();

  // A client-provided account id is never trusted blindly: it is accepted
  // only when the account actually belongs to the session business.
  let accountId: string | null = null;
  if (input.accountId) {
    const account = await prisma.account.findFirst({
      where: { id: input.accountId, businessId: business.id },
      select: { id: true },
    });
    accountId = account?.id ?? null;
  }

  const parses = parseFile(fileBytes, input.fileType);
  const mappingIssues = validateMapping(input.mapping, parses.headers);
  if (mappingIssues.length > 0) {
    throw new Error(`Column mapping problem: ${mappingIssues[0].message}`);
  }

  const normalized = parses.rows.map((raw, index) =>
    normalizeImportRow(raw, input.mapping, index),
  );

  const existing = new Set<string>(await listExistingFingerprints(prisma, business.id));
  const tags = tagDuplicates(normalized, existing);

  const categoryOptions = await listCategoryOptions(prisma, business.id);

  const selected = new Map(
    input.selections.map((s) => [s.rowIndex, s]),
  );
  const committedFingerprints = new Set<string>();

  const toCreate: Prisma.TransactionCreateManyInput[] = [];
  const errors: { sourceRow: number; message: string }[] = [];
  const reasons = { invalid: 0, existing: 0, inFile: 0, excluded: 0 };

  for (const row of normalized) {
    const tag = tags.get(row.rowIndex);
    const selection = selected.get(row.rowIndex);

    if (row.errors.length > 0) {
      reasons.invalid += 1;
      for (const message of row.errors.slice(0, 4)) {
        errors.push({ sourceRow: row.sourceRow, message });
      }
      continue;
    }

    // Already in the ledger (exact date-bearing fingerprint match).
    if (tag?.duplicate === "duplicate_existing") {
      reasons.existing += 1;
      continue;
    }

    // The user chose not to import this row.
    if (!selection || !selection.include) {
      reasons.excluded += 1;
      continue;
    }

    // A row the user selected that is still an exact duplicate of an
    // earlier INCLUDED row (same transaction twice in the file): keep the
    // first, count the rest as in-file duplicates — never write the same
    // business event twice.
    const fp = fingerprintOf(row);
    if (committedFingerprints.has(fp)) {
      reasons.inFile += 1;
      continue;
    }

    const suggestion = await categorizeImportRow(row);
    const category = await resolveCategory(
      categoryOptions,
      selection.categoryId,
      row,
      suggestion,
    );

    toCreate.push({
      businessId: business.id,
      accountId,
      date: new Date(`${row.date}T00:00:00.000Z`),
      description: row.description,
      amount: row.amount,
      type: row.type,
      categoryId: category?.id ?? null,
      source: input.fileType,
      reference: row.reference,
      aiCategory: category?.name ?? suggestion.categoryName,
      aiConfidence: suggestion.confidence,
      fingerprint: fp,
    });
    committedFingerprints.add(fp);
  }

  const importId = await prisma.$transaction(async (tx) => {
    if (toCreate.length > 0) {
      await tx.transaction.createMany({ data: toCreate });
    }
    const record = await tx.import.create({
      data: {
        businessId: business.id,
        accountId,
        filename: input.fileName,
        fileType: input.fileType,
        status: "committed",
        transactionsFound: normalized.length,
        transactionsImported: toCreate.length,
        errors:
          reasons.invalid > 0 || errors.length > 0
            ? {
                invalidRows: reasons.invalid,
                errors: errors.slice(0, 50),
                existingDuplicates: reasons.existing,
                inFileDuplicates: reasons.inFile,
                excluded: reasons.excluded,
              }
            : undefined,
        completedAt: new Date(),
      },
    });
    return record.id;
  });

  return {
    total: normalized.length,
    imported: toCreate.length,
    existingDuplicates: reasons.existing,
    inFileDuplicates: reasons.inFile,
    invalid: reasons.invalid,
    excluded: reasons.excluded,
    importId,
  };
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

async function listExistingFingerprints(
  prisma: PrismaClient,
  businessId: string,
): Promise<Set<string>> {
  const rows = await prisma.transaction.findMany({
    where: { businessId },
    select: { date: true, type: true, description: true, amount: true, reference: true },
  });
  const { transactionFingerprint } = await import("@/lib/finance/engine");
  const set = new Set<string>();
  for (const row of rows) {
    set.add(
      transactionFingerprint({
        date: row.date.toISOString().slice(0, 10),
        type: row.type as "income" | "expense" | "transfer",
        description: row.description,
        amount: canonicalAmount(row.amount.toString()),
        reference: row.reference,
      }),
    );
  }
  return set;
}

async function listCategoryOptions(
  prisma: PrismaClient,
  businessId: string,
): Promise<ImportCategoryOption[]> {
  const categories = await prisma.category.findMany({
    where: { OR: [{ businessId: null }, { businessId }] },
    select: { id: true, name: true, type: true },
  });
  return categories.map((c) => ({
    id: c.id,
    name: c.name,
    type: c.type as "income" | "expense",
  }));
}

/**
 * Resolve a category id for the row, in precedence order:
 *  1. the user's explicit review choice (business-owned or system),
 *  2. the file's own category text when it matches an app category,
 *  3. the rules-based suggestion,
 *  4. the deterministic fallback (Other / Other Income). Transfers always
 *     resolve to null — they are not categories.
 */
async function resolveCategory(
  options: ImportCategoryOption[],
  selectedId: string | null,
  row: NormalizedImportRow,
  suggestion: ImportSuggestion,
): Promise<ImportCategoryOption | null> {
  if (row.type === "transfer") return null;

  if (selectedId) {
    const found = options.find((o) => o.id === selectedId && o.type === row.type);
    if (found) return found;
  }

  if (row.category) {
    const byFile = matchByName(options, row.category, row.type);
    if (byFile) return byFile;
  }

  if (suggestion.categoryName && suggestion.categoryName !== "Transfer") {
    const bySuggestion = matchByName(options, suggestion.categoryName, row.type);
    if (bySuggestion) return bySuggestion;
  }

  const fallbackName = row.type === "income" ? "Other Income" : "Other";
  return matchByName(options, fallbackName, row.type) ?? null;
}

function matchByName(
  options: ImportCategoryOption[],
  name: string,
  type: "income" | "expense",
): ImportCategoryOption | null {
  const target = name.trim().toLowerCase();
  return (
    options.find((o) => o.type === type && o.name.trim().toLowerCase() === target) ??
    null
  );
}

function parseFile(
  bytes: Uint8Array,
  fileType: "csv" | "xlsx",
): { headers: string[]; rows: { sourceRow: number; values: Record<string, string> }[] } {
  if (fileType === "csv") {
    const text = new TextDecoder("utf-8").decode(bytes).replace(/^\uFEFF/, "");
    const parsed = parseCsv(text);
    if (parsed.headers.length === 0) {
      throw new Error("This CSV file is empty or unreadable.");
    }
    return parsed;
  }

  const buffer = bytes.slice().buffer as ArrayBuffer;
  const parsed = parseXlsx(buffer);
  if (parsed.headers.length === 0) {
    throw new Error("This spreadsheet has no headers in the first row.");
  }
  return parsed;
}

function toHistoryDto(m: ImportModel): ImportHistoryItem {
  let errors: ImportHistoryItem["errors"] = null;
  if (m.errors) {
    const raw = m.errors as {
      invalidRows?: number;
      errors?: unknown[];
      existingDuplicates?: number;
      inFileDuplicates?: number;
      excluded?: number;
    };
    const list = Array.isArray(raw.errors) ? raw.errors : [];
    errors = {
      invalidRows: typeof raw.invalidRows === "number" ? raw.invalidRows : 0,
      errors: list,
      existingDuplicates:
        typeof raw.existingDuplicates === "number" ? raw.existingDuplicates : 0,
      inFileDuplicates:
        typeof raw.inFileDuplicates === "number" ? raw.inFileDuplicates : 0,
      excluded: typeof raw.excluded === "number" ? raw.excluded : 0,
    };
  }
  return {
    id: m.id,
    filename: m.filename,
    fileType: m.fileType,
    status: m.status,
    transactionsFound: m.transactionsFound,
    transactionsImported: m.transactionsImported,
    errors,
    createdAt: m.createdAt.toISOString(),
    completedAt: m.completedAt ? m.completedAt.toISOString() : null,
  };
}