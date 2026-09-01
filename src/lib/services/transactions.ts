import { requireAuthContext } from "@/lib/services/auth-context";
import type { TransactionModel } from "@/generated/prisma/models/Transaction";

/** Data object shape for a transaction (Decimal converted to string). */
export interface TransactionServiceData {
  id: string;
  businessId: string;
  accountId: string | null;
  date: string;
  description: string;
  amount: string;
  type: string;
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

interface ListTransactionsParams {
  page?: number;
  pageSize?: number;
  search?: string;
}

/**
 * List transactions for the CURRENT user's business, always scoped by the
 * session-derived businessId. Never trusts a client-supplied businessId.
 */
export async function listTransactions(params: ListTransactionsParams = {}): Promise<{
  items: TransactionServiceData[];
  total: number;
}> {
  const { prisma, business } = await requireAuthContext();
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20));

  const where = {
    businessId: business.id,
    ...(params.search
      ? {
          description: {
            contains: params.search,
            mode: "insensitive" as const,
          },
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      orderBy: { date: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.transaction.count({ where }),
  ]);

  return {
    items: items.map(toDto),
    total,
  };
}

/**
 * Fetch a single transaction, scoped to the current user's business.
 * Returns null when it doesn't exist or is owned by another business.
 */
export async function getTransaction(id: string): Promise<TransactionServiceData | null> {
  const { prisma, business } = await requireAuthContext();
  const tx = await prisma.transaction.findFirst({
    where: { id, businessId: business.id },
  });
  return tx ? toDto(tx) : null;
}

/**
 * Delete a transaction owned by the current business. Returns false when the
 * transaction doesn't exist or belongs to another business (the service layer
 * never lets a user touch another tenant's row).
 */
export async function deleteTransaction(id: string): Promise<boolean> {
  const { prisma, business } = await requireAuthContext();
  const existing = await prisma.transaction.findFirst({
    where: { id, businessId: business.id },
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
    type: t.type,
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