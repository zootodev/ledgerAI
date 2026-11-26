/**
 * One-off, tenant-scoped repair for OPay airtime/data/bills/betting STAKES
 * that were imported as Income. Dry-run is the default and is read-only.
 *
 * Usage:
 *   npx tsx scripts/fix-airtime-type.ts --business <uuid> [--dry-run] [--summary]
 *   npx tsx scripts/fix-airtime-type.ts --business <uuid> --apply
 *
 * The classifier is the same spend-only helper used by the importer. It never
 * touches genuine credits (winnings, refunds, salary) and is idempotent: once
 * a row is Expense it no longer appears. NO DATABASE MIGRATION IS NEEDED.
 *
 * Flipping the type is not enough: an income category on an expense row is
 * still wrong. Both changes are made in one transaction; unconfident rows go
 * back to Review on the neutral expense category.
 */
import { config } from "dotenv";
import path from "node:path";
import { getPrismaClient } from "../src/lib/db/client";
import { looksLikeSpendWithoutDirection } from "../src/lib/import/spend-direction";
import { planAirtimeCategoryReset } from "../src/lib/import/airtime-repair";
import { writeRowSnapshot, type SnapshotRow } from "./snapshot";

config({ path: path.resolve(process.cwd(), ".env.local") });
config();

interface Args {
  businessId: string;
  dryRun: boolean;
  summary: boolean;
  apply: boolean;
}

function parseArgs(argv: string[]): Args {
  const get = (flag: string) => {
    const index = argv.indexOf(flag);
    return index === -1 ? undefined : argv[index + 1];
  };
  const businessId = get("--business");
  if (!businessId) {
    throw new Error("Missing --business <uuid>. This repair is always tenant-scoped.");
  }
  return {
    businessId,
    dryRun: argv.includes("--dry-run") || !argv.includes("--apply"),
    summary: argv.includes("--summary"),
    apply: argv.includes("--apply"),
  };
}

function money(value: number, currency: string): string {
  return `${currency} ${value.toLocaleString("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const prisma = getPrismaClient();
  if (!prisma) throw new Error("DATABASE_URL is not configured.");

  const business = await prisma.business.findUnique({
    where: { id: args.businessId },
    select: { id: true, currency: true },
  });
  if (!business) throw new Error("Business not found for the supplied --business id.");

  const [candidates, categories, rules] = await Promise.all([
    prisma.transaction.findMany({
      where: { businessId: args.businessId, type: "income" },
      select: {
        id: true,
        date: true,
        description: true,
        amount: true,
        categoryId: true,
        type: true,
        aiConfidence: true,
        updatedAt: true,
      },
      orderBy: [{ date: "asc" }, { id: "asc" }],
    }),
    prisma.category.findMany({
      where: { OR: [{ businessId: null }, { businessId: args.businessId }] },
      select: { id: true, name: true, type: true },
    }),
    prisma.categoryRule.findMany({
      where: { businessId: args.businessId },
      select: {
        id: true,
        matchType: true,
        pattern: true,
        categoryId: true,
        categoryName: true,
        createdAt: true,
      },
    }),
  ]);

  const affected = candidates.filter((row) => looksLikeSpendWithoutDirection(row.description));
  const plans = new Map(
    affected.map((row) => [
      row.id,
      planAirtimeCategoryReset(
        row,
        categories,
        rules.map((rule) => ({
          id: rule.id,
          businessId: args.businessId,
          matchType: rule.matchType === "keyword" ? "keyword" : "merchant",
          pattern: rule.pattern,
          categoryId: rule.categoryId,
          categoryName: rule.categoryName ?? "Other",
          createdAt: rule.createdAt.toISOString(),
        })),
      ),
    ]),
  );
  const total = affected.reduce((sum, row) => sum + Number(row.amount.toString()), 0);
  const currency = business.currency || "NGN";
  const recategorised = affected.filter((row) => plans.get(row.id)?.recategorised).length;
  const toReview = affected.filter((row) => plans.get(row.id)?.toReview).length;

  if (!args.summary) {
    for (const row of affected) {
      const plan = plans.get(row.id)!;
      const category = categories.find((item) => item.id === plan.categoryId);
      console.log(
        `${row.date.toISOString().slice(0, 10)} income → expense ${money(Number(row.amount.toString()), currency)} ` +
          `category ${row.categoryId ?? "none"} → ${category?.name ?? "none"}` +
          `${plan.toReview ? " → REVIEW" : ""} ${row.description}`,
      );
    }
  }

  console.log(`Rows to change: ${affected.length}`);
  console.log(`Rows recategorised: ${recategorised}`);
  console.log(`Rows to Review: ${toReview}`);
  console.log(`Revenue: -${money(total, currency)}`);
  console.log(`Expenses: +${money(total, currency)}`);
  console.log(args.apply ? "Mode: APPLY" : "Mode: DRY RUN (no writes)");

  if (!args.apply) return;

  const snapshotRows: SnapshotRow[] = affected.map((row) => ({
    id: row.id,
    type: row.type,
    categoryId: row.categoryId,
    aiConfidence: row.aiConfidence?.toString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  }));
  const snapshotPath = await writeRowSnapshot("fix-airtime-type", args.businessId, snapshotRows);
  console.log(`Snapshot: ${snapshotPath}`);

  // The default 5s interactive-transaction timeout is too short for a bulk repair.
  const result = await prisma.$transaction(async (tx) => {
    let changed = 0;
    for (const row of affected) {
      const plan = plans.get(row.id)!;
      const updated = await tx.transaction.updateMany({
        where: { businessId: args.businessId, id: row.id, type: "income" },
        data: {
          type: "expense",
          categoryId: plan.categoryId,
          ...(plan.aiConfidence ? { aiConfidence: plan.aiConfidence } : {}),
        },
      });
      changed += updated.count;
    }
    return changed;
  }, { timeout: 300_000, maxWait: 30_000 });
  console.log(`Applied: ${result} rows changed to Expense with type-safe categories.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
