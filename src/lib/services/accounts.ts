import { requireAuthContext } from "@/lib/services/auth-context";
import { accountInputSchema, accountIdSchema } from "@/lib/validation/account";
import { zErrorMessage } from "@/lib/validation/index";
import type { AccountModel } from "@/generated/prisma/models/Account";

/** Data object shape for an account (serializable to the client). */
export interface AccountServiceData {
  id: string;
  name: string;
  institution: string | null;
  currency: string;
  createdAt: string;
}

export interface AccountInput {
  name: string;
  institution?: string | null;
  currency?: string;
}

/** List all accounts for the authenticated user's business. */
export async function listAccounts(): Promise<AccountServiceData[]> {
  const { prisma, business } = await requireAuthContext();
  const accounts = await prisma.account.findMany({
    where: { businessId: business.id },
    orderBy: { createdAt: "asc" },
  });
  return accounts.map(toDto);
}

/**
 * Create an account for the current business. The businessId is always taken
 * from the auth context — a client cannot create an account on another
 * business by supplying its id.
 */
export async function createAccount(input: AccountInput): Promise<AccountServiceData> {
  const parsed = accountInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(zErrorMessage(parsed.error));
  }

  const { prisma, business } = await requireAuthContext();
  const account = await prisma.account.create({
    data: {
      businessId: business.id,
      name: parsed.data.name,
      institution: parsed.data.institution,
      currency: parsed.data.currency,
    },
  });
  return toDto(account);
}

export interface AccountUpdateInput {
  name: string;
  institution?: string | null;
  currency?: string;
}

/**
 * Update an account owned by the current business. Scoped with both id and
 * businessId so someone else's account (or a guessed id) can never be edited.
 */
export async function updateAccount(id: string, input: AccountUpdateInput): Promise<AccountServiceData> {
  const idParsed = accountIdSchema.safeParse(id);
  if (!idParsed.success) throw new Error(zErrorMessage(idParsed.error));

  const parsed = accountInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(zErrorMessage(parsed.error));
  }

  const { prisma, business } = await requireAuthContext();
  const existing = await prisma.account.findFirst({
    where: { id: idParsed.data, businessId: business.id },
    select: { id: true },
  });
  if (!existing) throw new Error("Account not found.");

  const updated = await prisma.account.update({
    where: { id: idParsed.data },
    data: {
      name: parsed.data.name,
      institution: parsed.data.institution,
      currency: parsed.data.currency,
    },
  });
  return toDto(updated);
}

/**
 * Delete an account owned by the current business. Returns false when the
 * account doesn't exist or belongs to another business (never throws on a
 * cross-tenant id). Deleting an account nulls its transactions' account_id
 * (ON DELETE SET NULL) per the schema.
 */
export async function deleteAccount(id: string): Promise<boolean> {
  const idParsed = accountIdSchema.safeParse(id);
  if (!idParsed.success) return false;

  const { prisma, business } = await requireAuthContext();
  const existing = await prisma.account.findFirst({
    where: { id: idParsed.data, businessId: business.id },
    select: { id: true },
  });
  if (!existing) return false;

  await prisma.account.delete({ where: { id: existing.id } });
  return true;
}

function toDto(a: AccountModel): AccountServiceData {
  return {
    id: a.id,
    name: a.name,
    institution: a.institution,
    currency: a.currency,
    createdAt: a.createdAt.toISOString(),
  };
}