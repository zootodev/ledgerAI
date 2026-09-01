import { requireAuthContext } from "@/lib/services/auth-context";
import { businessUpdateSchema } from "@/lib/validation/business";
import { zErrorMessage } from "@/lib/validation/index";
import type { BusinessModel } from "@/generated/prisma/models/Business";

/** Data object shape for a business (serializable to the client). */
export interface BusinessServiceData {
  id: string;
  name: string;
  type: string | null;
  country: string;
  currency: string;
  size: string | null;
  goals: string[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Read the authenticated user's active business profile. Always scoped to the
 * session — the business id comes from the auth context, never the client.
 */
export async function getBusinessProfile(): Promise<BusinessServiceData> {
  const { prisma, business } = await requireAuthContext();
  const full = await prisma.business.findFirst({
    where: { id: business.id },
  });
  if (!full) throw new Error("Business not found.");
  return toDto(full);
}

export interface UpdateBusinessInput {
  name: string;
  type?: string | null;
  country?: string;
  currency?: string;
  size?: string | null;
  goals?: string[];
}

/**
 * Update the current business profile. The where clause is scoped to the
 * session-derived business id, so a client can never touch another user's
 * business even if it guessed the id.
 */
export async function updateBusiness(input: UpdateBusinessInput): Promise<BusinessServiceData> {
  const parsed = businessUpdateSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(zErrorMessage(parsed.error));
  }

  const { prisma, business } = await requireAuthContext();
  const updated = await prisma.business.update({
    where: { id: business.id },
    data: {
      name: parsed.data.name,
      type: parsed.data.type ?? null,
      country: parsed.data.country,
      currency: parsed.data.currency,
      size: parsed.data.size ?? null,
      goals: parsed.data.goals,
    },
  });
  return toDto(updated);
}

/** Convert a Prisma Business row to a serializable DTO. */
function toDto(b: BusinessModel): BusinessServiceData {
  return {
    id: b.id,
    name: b.name,
    type: b.type,
    country: b.country,
    currency: b.currency,
    size: b.size,
    goals: b.goals,
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
  };
}