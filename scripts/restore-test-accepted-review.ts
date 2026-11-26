/**
 * Tenant-scoped recovery for review rows accepted by the e2e review test.
 *
 * Usage:
 *   npx tsx scripts/restore-test-accepted-review.ts --business <uuid> [--summary]
 *   npx tsx scripts/restore-test-accepted-review.ts --business <uuid> --apply
 *   npx tsx scripts/restore-test-accepted-review.ts --business <uuid> --apply --confirm-no-owner-accepts
 *
 * Dry-run is the default and never writes. The window is fixed to the
 * 2026-11-26 incident: 11:30-14:15 WAT (10:30-13:15 UTC). The review service
 * does not persist an audit trail, so updatedAt + the confidence signal are
 * the only evidence. If that evidence cannot separate the test's accepts from
 * the owner's own accepts, the script says so, lists every row and REFUSES to
 * apply unless the owner explicitly passes --confirm-no-owner-accepts.
 */
import { config } from "dotenv";
import path from "node:path";
import { getPrismaClient } from "../src/lib/db/client";
import { REVIEW_THRESHOLD } from "../src/lib/ai/rules";
import { restoreApplyBlockReason } from "./confirmation";
import { writeRowSnapshot, type SnapshotRow } from "./snapshot";

config({ path: path.resolve(process.cwd(), ".env.local") });
config();

const WINDOW_START = new Date("2026-11-26T10:30:00.000Z"); // 11:30 WAT
const WINDOW_END = new Date("2026-11-26T13:15:00.000Z"); // 14:15 WAT
/** The engine's own low-confidence value; below REVIEW_THRESHOLD. */
const RESTORED_CONFIDENCE = "0.5000";
const RAISED_CONFIDENCE_FLOOR = "0.7500";

interface Args {
  businessId: string;
  apply: boolean;
  summary: boolean;
  confirmNoOwnerAccepts: boolean;
}

function parseArgs(argv: string[]): Args {
  const get = (flag: string) => {
    const index = argv.indexOf(flag);
    return index === -1 ? undefined : argv[index + 1];
  };
  const businessId = get("--business");
  if (!businessId) {
    throw new Error("Missing --business <uuid>. This recovery is always tenant-scoped.");
  }
  return {
    businessId,
    apply: argv.includes("--apply"),
    summary: argv.includes("--summary"),
    confirmNoOwnerAccepts: argv.includes("--confirm-no-owner-accepts"),
  };
}

interface Candidate {
  id: string;
  date: Date;
  amount: { toString(): string };
  description: string;
  categoryId: string | null;
  categoryName: string | null;
  categoryType: string | null;
  aiCategory: string | null;
  aiConfidence: { toString(): string } | null;
  type: string;
  source: string;
  updatedAt: Date;
  cause: "confidence_cleared" | "confidence_raised";
}

interface RestorePlan {
  categoryId: string | null;
  categoryLabel: string;
  basis: "suggestion" | "current" | "uncategorised";
}

function money(value: number, currency: string): string {
  return `${currency} ${value.toLocaleString("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Prefer the AI suggestion; otherwise keep a type-correct category if known. */
function planCategory(
  row: Candidate,
  categories: Array<{ id: string; name: string; type: string }>,
): RestorePlan {
  const suggestion = row.aiCategory?.trim().toLowerCase();
  if (suggestion) {
    const match = categories.find(
      (category) =>
        category.type === row.type && category.name.trim().toLowerCase() === suggestion,
    );
    if (match) return { categoryId: match.id, categoryLabel: match.name, basis: "suggestion" };
  }
  if (row.categoryId && row.categoryType === row.type) {
    return {
      categoryId: row.categoryId,
      categoryLabel: row.categoryName ?? "current category",
      basis: "current",
    };
  }
  return { categoryId: null, categoryLabel: "uncategorised", basis: "uncategorised" };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (Number(RESTORED_CONFIDENCE) >= REVIEW_THRESHOLD) {
    throw new Error("RESTORED_CONFIDENCE must stay below REVIEW_THRESHOLD.");
  }

  const prisma = getPrismaClient();
  if (!prisma) throw new Error("DATABASE_URL is not configured.");

  const business = await prisma.business.findUnique({
    where: { id: args.businessId },
    select: { id: true, currency: true },
  });
  if (!business) throw new Error("Business not found for the supplied --business id.");

  const select = {
    id: true,
    date: true,
    amount: true,
    description: true,
    categoryId: true,
    aiCategory: true,
    aiConfidence: true,
    type: true,
    source: true,
    updatedAt: true,
    category: { select: { name: true, type: true } },
  } as const;

  const [cleared, raised, categories, rules] = await Promise.all([
    prisma.transaction.findMany({
      where: {
        businessId: args.businessId,
        aiConfidence: null,
        categoryId: { not: null },
        updatedAt: { gte: WINDOW_START, lt: WINDOW_END },
      },
      select,
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
    }),
    // The review service's rule cascade lifts pending rows OUT of Review by
    // raising aiConfidence. Those rows are part of the same accept action.
    prisma.transaction.findMany({
      where: {
        businessId: args.businessId,
        aiConfidence: { gte: RAISED_CONFIDENCE_FLOOR },
        categoryId: { not: null },
        updatedAt: { gte: WINDOW_START, lt: WINDOW_END },
      },
      select,
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
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
        categoryName: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
  ]);

  const candidates: Candidate[] = [
    ...cleared.map((row) => ({
      ...row,
      categoryName: row.category?.name ?? null,
      categoryType: row.category?.type ?? null,
      cause: "confidence_cleared" as const,
    })),
    ...raised.map((row) => ({
      ...row,
      categoryName: row.category?.name ?? null,
      categoryType: row.category?.type ?? null,
      cause: "confidence_raised" as const,
    })),
  ].sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime() || a.id.localeCompare(b.id));

  const plans = new Map(candidates.map((row) => [row.id, planCategory(row, categories)]));
  const createdRules = rules.filter(
    (rule) => rule.createdAt >= WINDOW_START && rule.createdAt < WINDOW_END,
  );
  // CategoryRule has createdAt only; an upsert update does not change it.
  const changedRulesUndetectable = rules.length > createdRules.length;

  const signatures = new Set(
    candidates.map(
      (row) =>
        `${row.type}|${row.source}|${row.aiCategory ?? "none"}|${row.categoryName ?? "none"}`,
    ),
  );
  const correctionLike = candidates.some(
    (row) =>
      row.aiCategory &&
      row.categoryName &&
      row.aiCategory.trim().toLowerCase() !== row.categoryName.trim().toLowerCase(),
  );
  const ambiguous =
    signatures.size > 1 || correctionLike || changedRulesUndetectable;

  const clearedTotal = cleared.reduce((sum, row) => sum + Number(row.amount.toString()), 0);
  const raisedTotal = raised.reduce((sum, row) => sum + Number(row.amount.toString()), 0);
  const currency = business.currency || "NGN";

  console.log("Window: 2026-11-26 11:30-14:15 WAT (10:30-13:15 UTC)");
  console.log(`Business: ${args.businessId}`);
  console.log(`Rows with confidence cleared: ${cleared.length} (${money(clearedTotal, currency)})`);
  console.log(`Rows lifted out by cascade: ${raised.length} (${money(raisedTotal, currency)})`);
  console.log(`Candidate rows: ${candidates.length}`);
  console.log(`Category rules created in window: ${createdRules.length}`);
  console.log(
    `Rules that would be removed: ${createdRules.length}${changedRulesUndetectable ? " (changed rules cannot be dated; see below)" : ""}`,
  );
  console.log(`Rows that would be restored: ${candidates.length}`);

  if (ambiguous) {
    console.log(
      "AMBIGUOUS: the window cannot reliably tell the test's accepts apart from the owner's own accepts " +
        `(distinct review signatures: ${signatures.size}; correction-like rows: ${correctionLike}; ` +
        `rule changes undatable: ${changedRulesUndetectable}). Listing rows instead of guessing.`,
    );
  }
  console.log(`Confirmed no owner accepts: ${args.confirmNoOwnerAccepts}`);

  if (!args.summary) {
    console.log("--- rows ---");
    for (const row of candidates) {
      const plan = plans.get(row.id)!;
      console.log(
        `${row.date.toISOString().slice(0, 10)} ${money(Number(row.amount.toString()), currency)} ` +
          `[${row.cause}] current=${row.categoryName ?? "none"} → restore=${plan.categoryLabel} ` +
          `(confidence ${RESTORED_CONFIDENCE}, ${plan.basis}) ${row.description}`,
      );
    }
    console.log("--- rules to remove (created in window) ---");
    for (const rule of createdRules) {
      console.log(`${rule.createdAt.toISOString()} ${rule.matchType} ${rule.pattern} → ${rule.categoryName ?? "none"}`);
    }
    if (changedRulesUndetectable) {
      console.log("--- rules changed in window: NOT DATEABLE (CategoryRule has no updatedAt) ---");
      for (const rule of rules) {
        const created = createdRules.some((item) => item.id === rule.id);
        console.log(
          `${rule.createdAt.toISOString()} ${rule.matchType} ${rule.pattern} → ${rule.categoryName ?? "none"}` +
            `${created ? " (created in window — would be removed)" : " (left untouched)"}`,
        );
      }
    }
  }

  console.log(args.apply ? "Mode: APPLY requested" : "Mode: DRY RUN (no writes)");

  if (!args.apply) return;
  const blockReason = restoreApplyBlockReason(ambiguous, args.confirmNoOwnerAccepts);
  if (blockReason) throw new Error(blockReason);

  const snapshotRows: SnapshotRow[] = candidates.map((row) => ({
    id: row.id,
    type: row.type,
    categoryId: row.categoryId,
    aiConfidence: row.aiConfidence?.toString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  }));
  const snapshotPath = await writeRowSnapshot(
    "restore-test-accepted-review",
    args.businessId,
    snapshotRows,
  );
  console.log(`Snapshot: ${snapshotPath}`);

  const result = await prisma.$transaction(async (tx) => {
    let restored = 0;
    for (const row of candidates) {
      const plan = plans.get(row.id)!;
      const updated = await tx.transaction.updateMany({
        where: {
          businessId: args.businessId,
          id: row.id,
          updatedAt: row.updatedAt,
          ...(row.cause === "confidence_cleared"
            ? { aiConfidence: null }
            : { aiConfidence: { gte: RAISED_CONFIDENCE_FLOOR } }),
        },
        data: { categoryId: plan.categoryId, aiConfidence: RESTORED_CONFIDENCE },
      });
      restored += updated.count;
    }
    const removed = await tx.categoryRule.deleteMany({
      where: {
        businessId: args.businessId,
        id: { in: createdRules.map((rule) => rule.id) },
      },
    });
    return { restored, removed: removed.count };
  });
  console.log(`Applied: ${result.restored} rows restored, ${result.removed} rules removed.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
