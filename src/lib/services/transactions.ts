import { requireAuthContext } from "@/lib/services/auth-context";
import {
  transactionInputSchema,
  transactionIdSchema,
  transactionListQuerySchema,
  zErrorMessage,
} from "@/lib/validation/index";
import { transactionFingerprint } from "@/lib/finance/engine";
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
  const query = transactionListQuerySchema.parse(direct);

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

  const [items, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      orderBy: effectiveOrder,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.transaction.count({ where }),
  ]);

  return {
    items: items.map(toDto),
    total,
    page: query.page,
    pageSize: query.pageSize,
    pages: Math.max(1, Math.ceil(total / query.pageSize)),
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
 */
async function assertReferencedEntitiesBelong(
  prisma: PrismaClient,
  businessId: string,
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
    // Categories may be either the business's own OR built-in system categories.
    const category = await prisma.category.findFirst({
      where: {
        id: categoryId,
        OR: [{ businessId: null }, { businessId }],
      },
      select: { id: true },
    });
    if (!category) throw new Error("Category not found for this business.");
  }
}

/** Create a transaction owned by the current business (source: manual). */
export async function createTransaction(input: TransactionInput): Promise<TransactionServiceData> {
  const parsed = transactionInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(zErrorMessage(parsed.error));
  }

  const { prisma, business } = await requireAuthContext();
  await assertReferencedEntitiesBelong(prisma, business.id, parsed.data.accountId, parsed.data.categoryId);

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
  const existing = await prisma.transaction.findFirst({
    where: { id: idParsed.data, businessId: business.id },
    select: { id: true },
  });
  if (!existing) throw new Error("Transaction not found.");

  await assertReferencedEntitiesBelong(prisma, business.id, parsed.data.accountId, parsed.data.categoryId);

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
  return toDto(updated);
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