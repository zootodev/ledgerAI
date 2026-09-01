import { requireAuthContext } from "@/lib/services/auth-context";
import { categoryInputSchema, categoryIdSchema, categoryTypeSchema } from "@/lib/validation/category";
import { zErrorMessage } from "@/lib/validation/index";
import type { PrismaClient } from "@/generated/prisma/client";
import type { CategoryModel } from "@/generated/prisma/models/Category";

/** Data object shape for a category (serializable to the client). */
export interface CategoryServiceData {
  id: string;
  name: string;
  type: "income" | "expense";
  isSystem: boolean;
}

export interface CategoryInput {
  name: string;
  type: "income" | "expense";
}

/** Built-in categories available to every business (business_id IS NULL). */
export const SYSTEM_CATEGORIES: ReadonlyArray<{ name: string; type: "income" | "expense" }> = [
  { name: "Sales", type: "income" },
  { name: "Services", type: "income" },
  { name: "Other Income", type: "income" },
  { name: "Transportation", type: "expense" },
  { name: "Banking", type: "expense" },
  { name: "Utilities", type: "expense" },
  { name: "Marketing", type: "expense" },
  { name: "Inventory", type: "expense" },
  { name: "Rent", type: "expense" },
  { name: "Salaries", type: "expense" },
  { name: "Software", type: "expense" },
  { name: "Taxes", type: "expense" },
  { name: "Food", type: "expense" },
  { name: "Equipment", type: "expense" },
  { name: "Other", type: "expense" },
];

/**
 * Idempotently ensure the built-in system categories exist. Runs on every
 * category list so a fresh database (or one that predates this feature) is
 * provisioned on first read — no migration dependency. System rows are
 * identified by business_id IS NULL, so they can never collide with a
 * business's own categories.
 */
export async function ensureSystemCategories(prisma: PrismaClient): Promise<void> {
  const existing = await prisma.category.findMany({
    where: { businessId: null },
    select: { name: true, type: true },
  });
  const present = new Set(existing.map((c) => `${c.type}:${c.name}`));
  const missing = SYSTEM_CATEGORIES.filter((c) => !present.has(`${c.type}:${c.name}`));

  if (missing.length === 0) return;
  await prisma.category.createMany({
    data: missing.map((c) => ({ name: c.name, type: c.type, isSystem: true, businessId: null })),
  });
}

/**
 * List categories available to the current business: the built-in system set
 * (business_id IS NULL) plus the user's own custom categories. System
 * categories are read-only for owners; custom ones are fully user-owned.
 */
export async function listCategories(): Promise<CategoryServiceData[]> {
  const { prisma, business } = await requireAuthContext();
  await ensureSystemCategories(prisma);
  const categories = await prisma.category.findMany({
    where: {
      OR: [{ businessId: null }, { businessId: business.id }],
    },
    orderBy: [{ type: "asc" }, { name: "asc" }],
  });
  return categories.map(toDto);
}

/**
 * Create a custom category for the current business. The businessId comes
 * from the auth context, never the client. Duplicate (name + type) within the
 * business is rejected before hitting the DB uniqueness constraint.
 */
export async function createCategory(input: CategoryInput): Promise<CategoryServiceData> {
  const parsed = categoryInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(zErrorMessage(parsed.error));
  }

  const { prisma, business } = await requireAuthContext();
  const duplicate = await prisma.category.findFirst({
    where: { businessId: business.id, name: parsed.data.name, type: parsed.data.type },
    select: { id: true },
  });
  if (duplicate) {
    throw new Error(`A "${parsed.data.name}" category already exists.`);
  }

  const category = await prisma.category.create({
    data: {
      businessId: business.id,
      name: parsed.data.name,
      type: parsed.data.type,
      isSystem: false,
    },
  });
  return toDto(category);
}

export interface CategoryUpdateInput {
  name: string;
  type: "income" | "expense";
}

/**
 * Update a custom category owned by the current business. System categories
 * are deliberately not editable through this path.
 */
export async function updateCategory(id: string, input: CategoryUpdateInput): Promise<CategoryServiceData> {
  const idParsed = categoryIdSchema.safeParse(id);
  if (!idParsed.success) throw new Error(zErrorMessage(idParsed.error));

  const parsed = categoryInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(zErrorMessage(parsed.error));
  }

  const { prisma, business } = await requireAuthContext();
  const existing = await prisma.category.findFirst({
    where: { id: idParsed.data, businessId: business.id },
    select: { id: true, name: true, type: true },
  });
  if (!existing) throw new Error("Category not found.");

  const duplicate = await prisma.category.findFirst({
    where: {
      businessId: business.id,
      name: parsed.data.name,
      type: parsed.data.type,
      id: { not: idParsed.data },
    },
    select: { id: true },
  });
  if (duplicate) {
    throw new Error(`A "${parsed.data.name}" category already exists.`);
  }

  const updated = await prisma.category.update({
    where: { id: idParsed.data },
    data: { name: parsed.data.name, type: parsed.data.type },
  });
  return toDto(updated);
}

/**
 * Delete a custom category owned by the current business. System categories
 * cannot be deleted by owners. Returns false for unknown/foreign ids.
 */
export async function deleteCategory(id: string): Promise<boolean> {
  const idParsed = categoryIdSchema.safeParse(id);
  if (!idParsed.success) return false;

  const { prisma, business } = await requireAuthContext();
  const existing = await prisma.category.findFirst({
    where: { id: idParsed.data, businessId: business.id, isSystem: false },
    select: { id: true },
  });
  if (!existing) return false;

  await prisma.category.delete({ where: { id: existing.id } });
  return true;
}

/** Validate a raw category type string, used at the action boundary. */
export function isCategoryType(value: unknown): value is "income" | "expense" {
  return categoryTypeSchema.safeParse(value).success;
}

function toDto(c: CategoryModel): CategoryServiceData {
  return {
    id: c.id,
    name: c.name,
    type: c.type as "income" | "expense",
    isSystem: c.isSystem,
  };
}