import { requireAuthContext } from "@/lib/services/auth-context";
import type { ImportCommitInput } from "@/lib/validation/import";
import {
  normalizeImportRow,
  parseCsv,
  parseXlsx,
  reconcileNormalizedRows,
  findOpeningBalance,
  tagDuplicates,
  fingerprintOf,
  validateMapping,
  categorizeImportRow,
  matchByName,
  fallbackCategoryName,
} from "@/lib/import/index";
import { extractMerchantKey } from "@/lib/ai/merchant-key";
import { MAX_IMPORT_EXCEPTIONS, NOT_A_TRANSACTION_REASON } from "@/lib/import/types";
import { parsePdf } from "@/lib/import/parse-pdf";
import { categoryMatchesRowType } from "@/lib/ai/rules";
import { persistLearnedRules } from "@/lib/services/rules";
import type { CategoryRuleLearnInput } from "@/lib/validation/rules";
import { canonicalAmount } from "@/lib/import/dedupe";
import type {
  ImportCategoryOption,
  ImportException,
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
    skipped: number;
    excluded: number;
    /** Bounded post-import exception queue (rows not written). */
    exceptions: ImportException[];
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
  skipped: number;
  excluded: number;
  importId: string;
  /** How many category rules were remembered from review corrections. */
  learnedRuleCount: number;
  /** Bounded exception queue: rows that were not written, with reasons. */
  exceptions: ImportException[];
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

/** Inclusive date span of the current business's recorded transactions. */
export interface ExistingDateRange {
  from: string | null;
  to: string | null;
}

/**
 * The earliest/latest transaction date already recorded for the session
 * business, optionally scoped to one owned account. Used only to warn about
 * a statement period that overlaps data the user already has. A client
 * account id is honoured only when it belongs to the business; an unknown or
 * foreign id falls back to the business-wide range (never another tenant).
 */
export async function getExistingDateRange(
  accountId?: string | null,
): Promise<ExistingDateRange> {
  const { prisma, business } = await requireAuthContext();
  let scopedAccountId: string | null = null;
  if (accountId) {
    const account = await prisma.account.findFirst({
      where: { id: accountId, businessId: business.id },
      select: { id: true },
    });
    scopedAccountId = account?.id ?? null;
  }
  const agg = await prisma.transaction.aggregate({
    where: {
      businessId: business.id,
      ...(scopedAccountId ? { accountId: scopedAccountId } : {}),
    },
    _min: { date: true },
    _max: { date: true },
  });
  return {
    from: agg._min.date ? agg._min.date.toISOString().slice(0, 10) : null,
    to: agg._max.date ? agg._max.date.toISOString().slice(0, 10) : null,
  };
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

  const parses = await parseFile(fileBytes, input.fileType);
  const mappingIssues = validateMapping(input.mapping, parses.headers);
  if (mappingIssues.length > 0) {
    throw new Error(`Column mapping problem: ${mappingIssues[0].message}`);
  }

  const normalized = parses.rows.map((raw, index) =>
    normalizeImportRow(raw, input.mapping, index),
  );
  // Verify the statement's own balance math (and correct an obvious
  // debit/credit mix-up) before categorizing, so preview and commit agree.
  const reconciled = reconcileNormalizedRows(normalized, findOpeningBalance(normalized));
  const rows = reconciled.rows;

  const existing = new Set<string>(await listExistingFingerprints(prisma, business.id));
  const tags = tagDuplicates(rows, existing);

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
  const reasons = { invalid: 0, skipped: 0, existing: 0, inFile: 0, excluded: 0 };

  // Bounded post-import exception queue: every row that is NOT written is
  // recorded with a machine-readable reason so the review step and the
  // import history can surface it. Capped so the JSON stays small.
  const exceptions: ImportException[] = [];
  const pushException = (
    row: NormalizedImportRow,
    displayIndex: number,
    reason: ImportException["reason"],
    messages: string[],
  ): void => {
    if (exceptions.length >= MAX_IMPORT_EXCEPTIONS) return;
    exceptions.push({
      sourceRow: row.sourceRow,
      displayRow: displayIndex + 1,
      reason,
      description: row.description,
      date: row.date || row.rawDate,
      amount: row.amount,
      messages,
    });
  };

  // Learned-rule candidates from review corrections: keyed by merchant key.
  // A value of null marks a conflict (same key corrected to different
  // categories) and the whole key is skipped.
  const learnCandidates = new Map<string, string | null>();

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const tag = tags.get(row.rowIndex);
    const selection = selected.get(row.rowIndex);

    // Statement artifacts (opening/closing balance, totals, page headers) are
    // set aside as "not a transaction" — never reported as unreadable data.
    if (row.skipped) {
      reasons.skipped += 1;
      pushException(row, index, "skipped", [NOT_A_TRANSACTION_REASON]);
      continue;
    }

    if (row.errors.length > 0) {
      reasons.invalid += 1;
      const messages = row.errors.slice(0, 4);
      for (const message of messages) {
        errors.push({ sourceRow: row.sourceRow, message });
      }
      pushException(row, index, "invalid", messages);
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
      pushException(row, index, "duplicate_existing", []);
      continue;
    }

    // The user chose not to import this row.
    if (!selection || !selection.include) {
      reasons.excluded += 1;
      pushException(row, index, "excluded", []);
      continue;
    }

    // A row the user selected that is still an exact duplicate of an
    // earlier INCLUDED row (same transaction twice in the file): keep the
    // first, count the rest as in-file duplicates — never write the same
    // business event twice.
    const fp = fingerprintOf(row);
    if (committedFingerprints.has(fp)) {
      reasons.inFile += 1;
      pushException(row, index, "duplicate_in_file", []);
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
    const hasReasons =
      reasons.invalid > 0 ||
      reasons.skipped > 0 ||
      reasons.existing > 0 ||
      reasons.inFile > 0 ||
      reasons.excluded > 0;
    const record = await tx.import.create({
      data: {
        businessId: business.id,
        accountId,
        filename: input.fileName,
        fileType: input.fileType,
        status: "committed",
        transactionsFound: rows.length,
        transactionsImported: toCreate.length,
        errors:
          hasReasons || errors.length > 0
            ? ({
                invalidRows: reasons.invalid,
                errors: errors.slice(0, 50),
                existingDuplicates: reasons.existing,
                inFileDuplicates: reasons.inFile,
                skipped: reasons.skipped,
                excluded: reasons.excluded,
                exceptions,
              } as unknown as Prisma.InputJsonObject)
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
    total: rows.length,
    imported: toCreate.length,
    existingDuplicates: reasons.existing,
    inFileDuplicates: reasons.inFile,
    invalid: reasons.invalid,
    skipped: reasons.skipped,
    excluded: reasons.excluded,
    importId,
    learnedRuleCount,
    exceptions,
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

async function parseFile(
  bytes: Uint8Array,
  fileType: "csv" | "xlsx" | "pdf",
): Promise<{ headers: string[]; rows: { sourceRow: number; values: Record<string, string> }[] }> {
  if (fileType === "pdf") {
    // Deterministic re-parse of the SAME bytes the preview saw; any parse
    // failure aborts the commit with the actionable extraction error.
    return await parsePdf(bytes);
  }

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
      skipped?: number;
      excluded?: number;
      exceptions?: unknown[];
    };
    const list = Array.isArray(raw.errors) ? raw.errors : [];
    errors = {
      invalidRows: typeof raw.invalidRows === "number" ? raw.invalidRows : 0,
      errors: list,
      existingDuplicates:
        typeof raw.existingDuplicates === "number" ? raw.existingDuplicates : 0,
      inFileDuplicates:
        typeof raw.inFileDuplicates === "number" ? raw.inFileDuplicates : 0,
      skipped: typeof raw.skipped === "number" ? raw.skipped : 0,
      excluded: typeof raw.excluded === "number" ? raw.excluded : 0,
      exceptions: parseExceptions(raw.exceptions),
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

const EXCEPTION_REASONS: readonly ImportException["reason"][] = [
  "invalid",
  "duplicate_existing",
  "duplicate_in_file",
  "skipped",
  "excluded",
];

/**
 * Defensively narrow the persisted exception JSON back into typed entries,
 * dropping anything malformed. Old imports (no exceptions array) yield [].
 */
function parseExceptions(value: unknown): ImportException[] {
  if (!Array.isArray(value)) return [];
  const out: ImportException[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const reason = e.reason;
    if (typeof reason !== "string" || !EXCEPTION_REASONS.includes(reason as ImportException["reason"])) {
      continue;
    }
    out.push({
      sourceRow: typeof e.sourceRow === "number" ? e.sourceRow : 0,
      displayRow: typeof e.displayRow === "number" ? e.displayRow : 0,
      reason: reason as ImportException["reason"],
      description: typeof e.description === "string" ? e.description : "",
      date: typeof e.date === "string" ? e.date : "",
      amount: typeof e.amount === "string" ? e.amount : "",
      messages: Array.isArray(e.messages)
        ? e.messages.filter((m): m is string => typeof m === "string")
        : [],
    });
  }
  return out;
}