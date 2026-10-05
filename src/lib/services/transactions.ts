import { requireAuthContext } from "@/lib/services/auth-context";
import {
  transactionInputSchema,
  transactionIdSchema,
  transactionListQuerySchema,
  zErrorMessage,
} from "@/lib/validation/index";
import { transactionFingerprint } from "@/lib/finance/engine";
import { extractMerchantKey } from "@/lib/ai/merchant-key";
import { learnMerchantRule } from "@/lib/services/rules";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import type { TransactionModel } from "@/generated/prisma/models/Transaction";

/** Data object shape for a transaction (Decimal converted to string). */
export interface TransactionServiceData {
  id: string;
  businessId: string;
  accountId: string | null;
  date: string;
  description: string;
  amount: string;
  type: "income" | "expense" | "transfer";
  categoryId: string | null;
  source: string;
  reference: string | null;
  notes: string | null;
  aiCategory: string | null;
  aiConfidence: number | null;
  fingerprint: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TransactionInput {
  date: string;
  description: string;
  amount: string;
  type: "income" | "expense" | "transfer";
  accountId?: string | null;
  categoryId?: string | null;
  reference?: string | null;
  notes?: string | null;
}

export interface ListTransactionsParams {
  page?: number;
  pageSize?: number;
  search?: string;
  type?: "income" | "expense" | "transfer";
  accountId?: string;
  categoryId?: string;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: "date" | "amount" | "description" | "createdAt";
  sortDir?: "asc" | "desc";
}

export interface ListTransactionsResult {
  items: TransactionServiceData[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}

const sortToOrder: Record<string, Prisma.TransactionOrderByWithRelationInput> = {
  date: { date: "desc" },
  amount: { amount: "desc" },
  description: { description: "asc" },
  createdAt: { createdAt: "desc" },
};

/**
 * List transactions for the CURRENT user's business with search, filters,
 * sorting, and pagination. Every query is scoped to the session-derived
 * business id — the client only ever supplies filter values, never a
 * businessId.
 */
export async function listTransactions(
  params: ListTransactionsParams = {},
): Promise<ListTransactionsResult> {
  const { prisma, business } = await requireAuthContext();

  const direct: Record<string, unknown> = { ...params };
  // Coerce page/pageSize through the query schema so clamping is consistent.
  // A malformed/unparseable query must never 500 the page — fall back to a
  // safe default list instead of throwing.
  const queryParsed = transactionListQuerySchema.safeParse(direct);
  const query = queryParsed.success
    ? queryParsed.data
    : transactionListQuerySchema.parse({});

  const where: Prisma.TransactionWhereInput = {
    businessId: business.id,
    ...(query.search
      ? {
          description: {
            contains: query.search,
            mode: "insensitive" as const,
          },
        }
      : {}),
    ...(query.type ? { type: query.type } : {}),
    ...(query.accountId ? { accountId: query.accountId } : {}),
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    ...(query.dateFrom || query.dateTo
      ? {
          date: {
            ...(query.dateFrom
              ? { gte: new Date(`${query.dateFrom}T00:00:00.000Z`) }
              : {}),
            ...(query.dateTo
              ? { lte: new Date(`${query.dateTo}T23:59:59.999Z`) }
              : {}),
          },
        }
      : {}),
  };

  const orderBy = sortToOrder[query.sortBy] ?? sortToOrder.date;
  const effectiveOrder: Prisma.TransactionOrderByWithRelationInput =
    query.sortDir === "asc"
      ? flipOrder(orderBy)
      : orderBy;

  // Paginate against the AUTHORITATIVE row count: the page is clamped to
  // [1, pages] after the count. A stale/stuffed `?page=99` (or a page that
  // goes out of range after filters shrink the set) must never render an
  // empty body with a misleading footer — it falls back to the last valid
  // page. Zero rows still yields page 1 (pages are never empty).
  const total = await prisma.transaction.count({ where });
  const pages = Math.max(1, Math.ceil(total / query.pageSize));
  const page = Math.min(Math.max(query.page, 1), pages);

  const items = await prisma.transaction.findMany({
    where,
    orderBy: effectiveOrder,
    skip: (page - 1) * query.pageSize,
    take: query.pageSize,
  });

  return {
    items: items.map(toDto),
    total,
    page,
    pageSize: query.pageSize,
    pages,
  };
}

/** Swap a single-field order for the asc/desc toggle. */
function flipOrder(
  order: Prisma.TransactionOrderByWithRelationInput,
): Prisma.TransactionOrderByWithRelationInput {
  const entry = Object.entries(order)[0];
  if (!entry) return order;
  return {
    [entry[0]]: entry[1] === "asc" ? "desc" : "asc",
  } as Prisma.TransactionOrderByWithRelationInput;
}

/**
 * Fetch a single transaction, scoped to the current user's business.
 * Returns null when it doesn't exist or is owned by another business.
 */
export async function getTransaction(id: string): Promise<TransactionServiceData | null> {
  const idParsed = transactionIdSchema.safeParse(id);
  if (!idParsed.success) return null;

  const { prisma, business } = await requireAuthContext();
  const tx = await prisma.transaction.findFirst({
    where: { id: idParsed.data, businessId: business.id },
  });
  return tx ? toDto(tx) : null;
}

/**
 * Before writing a transaction, verify any referenced account/category belongs
 * to the current business (or is a system category). This is the ownership
 * check for relational integrity: a client cannot attach a transaction to
 * another tenant's account or category by guessing its id.
 *
 * It also enforces the domain rules the UI already encodes:
 *  - transfers never carry a category, and
 *  - a category's type must match the transaction's type (an income category
 *    can't be attached to an expense, and vice versa).
 */
async function assertReferencedEntitiesBelong(
  prisma: PrismaClient,
  businessId: string,
  type: TransactionServiceData["type"],
  accountId?: string | null,
  categoryId?: string | null,
): Promise<void> {
  if (accountId) {
    const account = await prisma.account.findFirst({
      where: { id: accountId, businessId },
      select: { id: true },
    });
    if (!account) throw new Error("Account not found for this business.");
  }

  if (categoryId) {
    if (type === "transfer") {
      throw new Error("Transfers can't have a category.");
    }

    // Categories may be either the business's own OR built-in system categories.
    const category = await prisma.category.findFirst({
      where: {
        id: categoryId,
        OR: [{ businessId: null }, { businessId }],
      },
      select: { id: true, name: true, type: true },
    });
    if (!category) throw new Error("Category not found for this business.");
    if (category.type !== type) {
      throw new Error(
        `The "${category.name}" category is for ${category.type} transactions and can't be used on ${type} transactions.`,
      );
    }
  }
}

/** Create a transaction owned by the current business (source: manual). */
export async function createTransaction(input: TransactionInput): Promise<TransactionServiceData> {
  const parsed = transactionInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(zErrorMessage(parsed.error));
  }

  const { prisma, business } = await requireAuthContext();
  await assertReferencedEntitiesBelong(
    prisma,
    business.id,
    parsed.data.type,
    parsed.data.accountId,
    parsed.data.categoryId,
  );

  const tx = await prisma.transaction.create({
    data: {
      businessId: business.id,
      accountId: parsed.data.accountId,
      date: new Date(`${parsed.data.date}T00:00:00.000Z`),
      description: parsed.data.description,
      amount: parsed.data.amount,
      type: parsed.data.type,
      categoryId: parsed.data.categoryId,
      source: "manual",
      reference: parsed.data.reference,
      notes: parsed.data.notes,
      fingerprint: transactionFingerprint({
        date: parsed.data.date,
        type: parsed.data.type,
        description: parsed.data.description,
        amount: parsed.data.amount,
        reference: parsed.data.reference,
      }),
    },
  });
  return toDto(tx);
}

/**
 * Update a transaction owned by the current business. The row is first found
 * scoped by (id, businessId); referenced entities are re-validated. The
 * duplicate-detection fingerprint is recomputed from the edited values.
 */
export async function updateTransaction(
  id: string,
  input: TransactionInput,
): Promise<TransactionServiceData> {
  const idParsed = transactionIdSchema.safeParse(id);
  if (!idParsed.success) throw new Error(zErrorMessage(idParsed.error));

  const parsed = transactionInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(zErrorMessage(parsed.error));
  }

  const { prisma, business } = await requireAuthContext();
  // Pre-read the fields the learning flow needs so a correction is only
  // detected against what the AI originally suggested.
  const existing = await prisma.transaction.findFirst({
    where: { id: idParsed.data, businessId: business.id },
    select: {
      id: true,
      categoryId: true,
      aiCategory: true,
      description: true,
      type: true,
    },
  });
  if (!existing) throw new Error("Transaction not found.");

  await assertReferencedEntitiesBelong(
    prisma,
    business.id,
    parsed.data.type,
    parsed.data.accountId,
    parsed.data.categoryId,
  );

  const updated = await prisma.transaction.update({
    where: { id: idParsed.data },
    data: {
      accountId: parsed.data.accountId,
      date: new Date(`${parsed.data.date}T00:00:00.000Z`),
      description: parsed.data.description,
      amount: parsed.data.amount,
      type: parsed.data.type,
      categoryId: parsed.data.categoryId,
      reference: parsed.data.reference,
      notes: parsed.data.notes,
      fingerprint: transactionFingerprint({
        date: parsed.data.date,
        type: parsed.data.type,
        description: parsed.data.description,
        amount: parsed.data.amount,
        reference: parsed.data.reference,
      }),
    },
  });

  // Learn from a manual edit that moved a transaction AWAY from its AI
  // suggestion. Best-effort and explicitly AFTER the successful update: a
  // learning failure must never fail the user's edit.
  await maybeLearnFromEdit(prisma, business.id, {
    previous: existing,
    newCategoryId: parsed.data.categoryId ?? null,
    newDescription: parsed.data.description,
    newType: parsed.data.type,
  });

  return toDto(updated);
}

/**
 * Learn a merchant rule from a manual edit, but ONLY when the user actually
 * corrected the categorizer's suggestion:
 *  - the row was AI-categorized (hand-entered rows never learn),
 *  - the edit set a valid, different category (never the same as before),
 *  - the target category is not a transfer and differs from the AI category
 *    by name, and
 *  - a trustworthy merchant key can be extracted from the description.
 * Never throws: failures are logged and ignored.
 */
async function maybeLearnFromEdit(
  prisma: PrismaClient,
  businessId: string,
  edit: {
    previous: {
      id: string;
      categoryId: string | null;
      aiCategory: string | null;
      description: string;
      type: string;
    };
    newCategoryId: string | null;
    newDescription: string;
    newType: string;
  },
): Promise<void> {
  if (edit.newType === "transfer") return;
  if (!edit.previous.aiCategory) return;
  if (!edit.newCategoryId) return;
  if (edit.newCategoryId === edit.previous.categoryId) return;

  const category = await prisma.category.findFirst({
    where: { id: edit.newCategoryId, OR: [{ businessId: null }, { businessId }] },
    select: { id: true, name: true },
  });
  if (!category) return;
  if (category.name.trim().toLowerCase() === edit.previous.aiCategory.trim().toLowerCase()) {
    return;
  }

  const pattern = extractMerchantKey(edit.newDescription);
  if (!pattern) return;

  try {
    await learnMerchantRule({ pattern, categoryId: category.id, categoryName: category.name });
  } catch (err) {
    console.error("[rules] edit: failed to persist rule", {
      pattern,
      category: category.name,
      error: String(err),
    });
  }
}

/**
 * Delete a transaction owned by the current business. Returns false when the
 * transaction doesn't exist or belongs to another business (the service layer
 * never lets a user touch another tenant's row).
 */
export async function deleteTransaction(id: string): Promise<boolean> {
  const idParsed = transactionIdSchema.safeParse(id);
  if (!idParsed.success) return false;

  const { prisma, business } = await requireAuthContext();
  const existing = await prisma.transaction.findFirst({
    where: { id: idParsed.data, businessId: business.id },
    select: { id: true },
  });
  if (!existing) return false;

  await prisma.transaction.delete({ where: { id: existing.id } });
  return true;
}

/**
 * Convert a Prisma Decimal-bearing transaction row to a serializable DTO.
 * All financial figures become strings/numbers so no float drift crosses
 * the service boundary.
 */
function toDto(t: TransactionModel): TransactionServiceData {
  return {
    id: t.id,
    businessId: t.businessId,
    accountId: t.accountId,
    date: t.date.toISOString().slice(0, 10),
    description: t.description,
    amount: t.amount.toString(),
    type: t.type as TransactionServiceData["type"],
    categoryId: t.categoryId,
    source: t.source,
    reference: t.reference,
    notes: t.notes,
    aiCategory: t.aiCategory,
    aiConfidence: t.aiConfidence ? Number(t.aiConfidence.toString()) : null,
    fingerprint: t.fingerprint,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}