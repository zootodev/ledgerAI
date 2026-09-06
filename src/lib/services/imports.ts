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
  matchByName,
  fallbackCategoryName,
} from "@/lib/import/index";
import { extractMerchantKey } from "@/lib/ai/merchant-key";
import { categoryMatchesRowType } from "@/lib/ai/rules";
import { persistLearnedRules } from "@/lib/services/rules";
import type { CategoryRuleLearnInput } from "@/lib/validation/rules";
import { canonicalAmount } from "@/lib/import/dedupe";
import type {
  ImportCategoryOption,
  ImportSuggestion,
  NormalizedImportRow,
} from "@/lib/import/types";
import type { CategoryRuleDto } from "@/types";
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
  /** How many category rules were remembered from review corrections. */
  learnedRuleCount: number;
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
  // Business rules are re-loaded here independently of anything the preview
  // sent, so preview and commit always categorize against the same rules and
  // a stale or forged client preview can never change what is written.
  const businessRules = await listCategoryRulesForBusiness(prisma, business.id);

  const selected = new Map(
    input.selections.map((s) => [s.rowIndex, s]),
  );
  const committedFingerprints = new Set<string>();

  const toCreate: Prisma.TransactionCreateManyInput[] = [];
  const errors: { sourceRow: number; message: string }[] = [];
  const reasons = { invalid: 0, existing: 0, inFile: 0, excluded: 0 };

  // Learned-rule candidates from review corrections: keyed by merchant key.
  // A value of null marks a conflict (same key corrected to different
  // categories) and the whole key is skipped.
  const learnCandidates = new Map<string, string | null>();

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

    // Already in the ledger (exact date-bearing fingerprint match). Only an
    // explicit per-row "Import anyway" opt-in combined with an included
    // selection lets such a row through; otherwise it is skipped here. The
    // client flag is re-validated (never auto-import duplicates).
    if (
      tag?.duplicate === "duplicate_existing" &&
      !(selection?.include && selection.importAnyway === true)
    ) {
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

    const suggestion = await categorizeImportRow(row, { businessRules, categoryOptions });
    const category = await resolveCategory(
      categoryOptions,
      selection.categoryId,
      row,
      suggestion,
    );
    const included = !!category;

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

    if (included) {
      const learned = await collectReviewCorrection(
        row,
        categoryOptions,
        selection.categoryId,
        suggestion,
        category,
      );
      if (learned) {
        const prior = learnCandidates.get(learned.pattern);
        if (prior === undefined) {
          learnCandidates.set(learned.pattern, learned.category.id);
        } else if (prior !== learned.category.id) {
          learnCandidates.set(learned.pattern, null);
        }
      }
    }
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

  // Learn from review corrections AFTER the import committed. Best-effort:
  // a learning failure must never fail, retry or roll back the import.
  const candidates = collectLearningCandidates(learnCandidates, categoryOptions);
  let learnedRuleCount = 0;
  if (candidates.length > 0) {
    try {
      learnedRuleCount = await persistLearnedRules(candidates, "import");
    } catch (err) {
      console.error("[rules] import: learning batch failed", { error: String(err) });
    }
  }

  return {
    total: normalized.length,
    imported: toCreate.length,
    existingDuplicates: reasons.existing,
    inFileDuplicates: reasons.inFile,
    invalid: reasons.invalid,
    excluded: reasons.excluded,
    importId,
    learnedRuleCount,
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
 *  3. a learned business rule that matched (exact category id first so a
 *     rule survives a category rename between preview and commit),
 *  4. the rules-based suggestion,
 *  5. the deterministic fallback (Other / Other Income). Transfers always
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
    const found = options.find(
      (o) => o.id === selectedId && categoryMatchesRowType(o.type, row.type),
    );
    if (found) return found;
  }

  if (row.category) {
    const byFile = matchByName(options, row.category, row.type);
    if (byFile) return byFile;
  }

  if (suggestion.businessRule) {
    const byRule = resolveBusinessRuleOption(options, suggestion.businessRule, row.type);
    if (byRule) return byRule;
  }

  if (suggestion.categoryName && suggestion.categoryName !== "Transfer") {
    const bySuggestion = matchByName(options, suggestion.categoryName, row.type);
    if (bySuggestion) return bySuggestion;
  }

  const fallbackName = fallbackCategoryName(row.type);
  return matchByName(options, fallbackName, row.type) ?? null;
}

/**
 * Resolve a learned rule's target the same way as the engine: exact
 * category id first (survives a rename), then the stored category name.
 */
function resolveBusinessRuleOption(
  options: ImportCategoryOption[],
  rule: NonNullable<ImportSuggestion["businessRule"]>,
  type: "income" | "expense",
): ImportCategoryOption | null {
  if (rule.categoryId) {
    const byId = options.find(
      (o) => o.id === rule.categoryId && categoryMatchesRowType(o.type, type),
    );
    if (byId) return byId;
  }
  return matchByName(options, rule.categoryName, type);
}

/**
 * Build the list of business-scoped learned rules for the current business,
 * independent of anything the client sent.
 */
async function listCategoryRulesForBusiness(
  prisma: PrismaClient,
  businessId: string,
): Promise<CategoryRuleDto[]> {
  const rules = await prisma.categoryRule.findMany({
    where: { businessId },
    orderBy: { createdAt: "asc" },
  });
  return rules.map((r) => ({
    id: r.id,
    businessId: r.businessId,
    matchType: r.matchType as CategoryRuleDto["matchType"],
    pattern: r.pattern,
    categoryId: r.categoryId,
    categoryName: r.categoryName ?? "",
    createdAt: r.createdAt.toISOString(),
  }));
}

/**
 * Learn from a single committed row ONLY when the user explicitly overrode
 * the categorizer's suggestion with a different, valid category:
 *  - a non-null, resolvable review selection that differs from what the
 *    system would have chosen without it,
 *  - the row is not a transfer,
 *  - the suggestion did NOT come from the file's own category column,
 *  - a trustworthy merchant key can be extracted.
 * Returns null when any condition fails.
 */
async function collectReviewCorrection(
  row: NormalizedImportRow,
  categoryOptions: ImportCategoryOption[],
  selectedId: string | null,
  suggestion: ImportSuggestion,
  chosen: ImportCategoryOption,
): Promise<{ pattern: string; category: ImportCategoryOption } | null> {
  if (!selectedId) return null;
  if (row.type === "transfer") return null;
  if (row.category) return null;

  const base = await resolveCategory(categoryOptions, null, row, suggestion);
  if (base && base.id === chosen.id) return null;

  const pattern = extractMerchantKey(row.description);
  if (!pattern) return null;

  return { pattern, category: chosen };
}

/** Resolve the deduped candidate keys into validated learning intents. */
function collectLearningCandidates(
  learnCandidates: Map<string, string | null>,
  categoryOptions: ImportCategoryOption[],
): CategoryRuleLearnInput[] {
  const candidates: CategoryRuleLearnInput[] = [];
  for (const [pattern, categoryId] of learnCandidates) {
    if (!categoryId) continue; // conflicting key — learn nothing for it
    const category = categoryOptions.find((o) => o.id === categoryId);
    if (!category) continue;
    candidates.push({
      matchType: "merchant",
      pattern,
      categoryId: category.id,
      categoryName: category.name,
    });
  }
  return candidates;
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