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
 */
import { config } from "dotenv";
import path from "node:path";
import { getPrismaClient } from "../src/lib/db/client";
import { looksLikeSpendWithoutDirection } from "../src/lib/import/spend-direction";

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

  const candidates = await prisma.transaction.findMany({
    where: { businessId: args.businessId, type: "income" },
    select: { id: true, date: true, description: true, amount: true },
    orderBy: [{ date: "asc" }, { id: "asc" }],
  });
  const affected = candidates.filter((row) =>
    looksLikeSpendWithoutDirection(row.description),
  );
  const total = affected.reduce((sum, row) => sum + Number(row.amount.toString()), 0);
  const currency = business.currency || "NGN";

  if (!args.summary) {
    for (const row of affected) {
      console.log(
        `${row.date.toISOString().slice(0, 10)} ${row.id} income → expense ${money(Number(row.amount.toString()), currency)} ${row.description}`,
      );
    }
  }

  console.log(`Rows to change: ${affected.length}`);
  console.log(`Revenue: -${money(total, currency)}`);
  console.log(`Expenses: +${money(total, currency)}`);
  console.log(args.apply ? "Mode: APPLY" : "Mode: DRY RUN (no writes)");

  if (!args.apply) return;

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.transaction.updateMany({
      where: {
        businessId: args.businessId,
        type: "income",
        id: { in: affected.map((row) => row.id) },
      },
      data: { type: "expense" },
    });
    return updated.count;
  });
  console.log(`Applied: ${result} rows changed to Expense.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
