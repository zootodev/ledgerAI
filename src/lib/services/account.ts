import { getCurrentUser } from "@/lib/auth/server";
import { getSupabaseAdmin } from "@/lib/auth/supabase-admin";
import { getPrismaClient } from "@/lib/db/client";
import { signOut } from "@/lib/services/auth";

// ============================================================
// LedgerAI — Account data export & deletion (launch hardening)
// ------------------------------------------------------------
// SERVER-ONLY module: it reaches for the Supabase service role key and
// the Prisma service client, so it must never be imported from a client
// component. It is only used by the /account/export route and the
// delete-account server action; the build-time guard in section 4 fails
// the build if a service-role/env secret ever reaches a client bundle.
// ------------------------------------------------------------
// Both operations are strictly scoped to the authenticated user's own
// businesses (resolved from the session, never a client-supplied id).
// Export is read-only; deletion removes every owned row and then the
// Supabase Auth user (admin API, service role). Nothing here trusts the
// request beyond the session identity.
// ============================================================

export interface ExportedAccount {
  exportedAt: string;
  user: { id: string; email: string; name: string | null };
  businesses: ExportedBusiness[];
}

export interface ExportedBusiness {
  id: string;
  name: string;
  type: string | null;
  country: string;
  currency: string;
  size: string | null;
  goals: string[];
  createdAt: string;
  updatedAt: string;
  accounts: Record<string, unknown>[];
  categories: Record<string, unknown>[];
  transactions: Record<string, unknown>[];
  imports: Record<string, unknown>[];
  insights: Record<string, unknown>[];
  categoryRules: Record<string, unknown>[];
}

const iso = (value: Date | null | undefined): string | null =>
  value ? value.toISOString() : null;

const dec = (value: unknown): string | null =>
  value === null || value === undefined ? null : String(value);

/**
 * Collect the signed-in user's complete data set (JSON-serializable). Returns
 * null when there is no session so callers can 401/redirect.
 */
export async function exportAccountData(): Promise<ExportedAccount | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const prisma = getPrismaClient();
  if (!prisma) throw new Error("DATABASE_URL is not configured.");

  const businesses = await prisma.business.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
    include: {
      accounts: { orderBy: { createdAt: "asc" } },
      categories: { orderBy: { createdAt: "asc" } },
      transactions: { orderBy: { date: "asc" } },
      imports: { orderBy: { createdAt: "asc" } },
      insights: { orderBy: { createdAt: "asc" } },
      categoryRules: { orderBy: { createdAt: "asc" } },
    },
  });

  return {
    exportedAt: new Date().toISOString(),
    user: { id: user.id, email: user.email, name: user.name ?? null },
    businesses: businesses.map((business) => ({
      id: business.id,
      name: business.name,
      type: business.type,
      country: business.country,
      currency: business.currency,
      size: business.size,
      goals: business.goals,
      createdAt: business.createdAt.toISOString(),
      updatedAt: business.updatedAt.toISOString(),
      accounts: business.accounts.map((account) => ({
        id: account.id,
        name: account.name,
        institution: account.institution,
        currency: account.currency,
        createdAt: iso(account.createdAt),
        updatedAt: iso(account.updatedAt),
      })),
      categories: business.categories.map((category) => ({
        id: category.id,
        name: category.name,
        type: category.type,
        isSystem: category.isSystem,
        createdAt: iso(category.createdAt),
      })),
      transactions: business.transactions.map((transaction) => ({
        id: transaction.id,
        accountId: transaction.accountId,
        importId: transaction.importId,
        date: transaction.date.toISOString().slice(0, 10),
        description: transaction.description,
        amount: dec(transaction.amount),
        type: transaction.type,
        categoryId: transaction.categoryId,
        source: transaction.source,
        reference: transaction.reference,
        notes: transaction.notes,
        aiCategory: transaction.aiCategory,
        aiConfidence: dec(transaction.aiConfidence),
        createdAt: iso(transaction.createdAt),
        updatedAt: iso(transaction.updatedAt),
      })),
      imports: business.imports.map((importRow) => ({
        id: importRow.id,
        accountId: importRow.accountId,
        filename: importRow.filename,
        fileType: importRow.fileType,
        status: importRow.status,
        transactionsFound: importRow.transactionsFound,
        transactionsImported: importRow.transactionsImported,
        errors: importRow.errors,
        createdAt: iso(importRow.createdAt),
        completedAt: iso(importRow.completedAt),
      })),
      insights: business.insights.map((insight) => ({
        id: insight.id,
        type: insight.type,
        title: insight.title,
        description: insight.description,
        periodStart: insight.periodStart ? insight.periodStart.toISOString().slice(0, 10) : null,
        periodEnd: insight.periodEnd ? insight.periodEnd.toISOString().slice(0, 10) : null,
        createdAt: iso(insight.createdAt),
      })),
      categoryRules: business.categoryRules.map((rule) => ({
        id: rule.id,
        matchType: rule.matchType,
        pattern: rule.pattern,
        categoryId: rule.categoryId,
        categoryName: rule.categoryName,
        createdAt: iso(rule.createdAt),
      })),
    })),
  };
}

// ---------- CSV rendering (multi-section, one file) ----------

/** RFC-4180-ish escaping: quote when needed, always double inner quotes. */
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function csvSection(title: string, rows: Record<string, unknown>[]): string {
  const lines = [`# ${title} (${rows.length})`];
  if (rows.length === 0) return lines.join("\n");
  const columns = Array.from(
    rows.reduce((set, row) => {
      for (const key of Object.keys(row)) set.add(key);
      return set;
    }, new Set<string>()),
  );
  lines.push(columns.join(","));
  for (const row of rows) {
    lines.push(columns.map((column) => csvCell(row[column])).join(","));
  }
  return lines.join("\n");
}

/** Render an export as a single multi-section CSV document. */
export function exportToCsv(data: ExportedAccount): string {
  const sections: string[] = [];
  sections.push(
    [
      "# LedgerAI data export",
      `# exported_at,${data.exportedAt}`,
      `# user_id,${data.user.id}`,
      `# email,${csvCell(data.user.email)}`,
    ].join("\n"),
  );

  for (const business of data.businesses) {
    sections.push(
      csvSection(`business ${business.name}`, [
        {
          id: business.id,
          name: business.name,
          type: business.type,
          country: business.country,
          currency: business.currency,
          size: business.size,
          goals: business.goals.join("|"),
          createdAt: business.createdAt,
        },
      ]),
    );
    sections.push(csvSection("accounts", business.accounts));
    sections.push(csvSection("categories", business.categories));
    sections.push(csvSection("transactions", business.transactions));
    sections.push(csvSection("imports", business.imports));
    sections.push(csvSection("insights", business.insights));
    sections.push(csvSection("category_rules", business.categoryRules));
  }

  return `${sections.join("\n\n")}\n`;
}

/**
 * Delete the signed-in user's entire account: every owned business row
 * (cascading to accounts/categories/transactions/imports/insights/rules and
 * Ask conversations/messages) plus the Supabase Auth user. Requires the
 * literal confirmation string "DELETE" so it can't fire by accident.
 */
export async function deleteUserAccount(
  confirmation: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  if (confirmation.trim().toUpperCase() !== "DELETE") {
    return { ok: false, error: 'Type "DELETE" exactly to confirm account deletion.' };
  }

  const prisma = getPrismaClient();
  if (!prisma) return { ok: false, error: "The database is not configured." };

  // 1) Application data. Deleting the user row cascades through every
  //    business-scoped table (onDelete: Cascade in schema.prisma).
  try {
    await prisma.user.deleteMany({ where: { id: user.id } });
  } catch (e) {
    console.error("[auth] delete-account: app data deletion failed", {
      error: e instanceof Error ? e.message : String(e),
    });
    return { ok: false, error: "We couldn't delete your data. Please try again." };
  }

  // 2) The Supabase Auth user (admin API). Without the service role key the
  //    app rows are still gone and the session is cleared below, but the
  //    auth identity would linger — surface that so it can be retried.
  const admin = getSupabaseAdmin();
  if (admin) {
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) {
      console.error("[auth] delete-account: auth user deletion failed", {
        error: error.message,
      });
      await signOut();
      return { ok: false, error: "Your data was removed, but the sign-in account could not be deleted. Please contact support." };
    }
  } else {
    console.error("[auth] delete-account: SUPABASE_SERVICE_ROLE_KEY missing; auth user not deleted");
  }

  // 3) Clear the caller's session cookies.
  await signOut();
  return { ok: true };
}
