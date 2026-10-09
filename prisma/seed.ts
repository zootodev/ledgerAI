/* ============================================================
 * LedgerAI - Demo data seed (Phase 10)
 * ------------------------------------------------------------
 * Loads the Zooto Fashion Store demo business so the dashboard,
 * analytics, categories, rules and insights have realistic data
 * to render. Runs via the Prisma seed hook:
 *
 *     npm run db:seed            -> seed (create/refresh demo data)
 *     npm run db:seed -- --reset -> delete demo business data first
 *
 * SAFETY
 * ------
 * This seed operates EXCLUSIVELY on the demo user/business, never on
 * production data. It resolves the demo identity by email and touches
 * only rows owned by that demo business (accounts, transactions,
 * category rules, imports). System categories (business_id IS NULL) are
 * only ensured, never deleted. Reset deletes the demo business's own
 * rows only. Running this is harmless to any real user's data.
 *
 * The demo user is a real Supabase auth user created via the Admin API
 * (service role). public.users.id mirrors auth.users.id, matching the
 * sign-up flow (see src/lib/services/auth.ts).
 *
 * Requires env: DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL,
 *               SUPABASE_SERVICE_ROLE_KEY, SEED_ALLOW, SEED_DEMO_PASSWORD
 * ============================================================ */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { getPrismaClient } from "../src/lib/db/client";
import { ensureSystemCategories } from "../src/lib/services/categories";
import { transactionFingerprint } from "../src/lib/finance/engine";
import {
  DEMO_EMAIL,
  DEMO_PASSWORD_ENV,
  demoPasswordFromEnv,
  demoSeedAllowed,
} from "../src/lib/security/demo-seed";

const DEMO_NAME = "Zooto Fashion Store";
const DEMO_BUSINESS_NAME = "Zooto Fashion Store";
const DEMO_BUSINESS_TYPE = "retail";
const DEMO_CURRENCY = "NGN";
const DEMO_COUNTRY = "NG";

/* ------------------------------------------------------------
 * Demo accounts
 * ------------------------------------------------------------ */
const DEMO_ACCOUNTS: { name: string; institution: string }[] = [
  { name: "GTBank Current", institution: "GTBank" },
  { name: "Moniepoint Business", institution: "Moniepoint" },
  { name: "Opay Wallet", institution: "Opay" },
];

/* ------------------------------------------------------------
 * Demo transactions (about 3 months, mirrors the blueprint §23
 * category list). amount is in major units (naira). type is one of
 * income | expense | transfer.
 * ------------------------------------------------------------ */
interface SeedTransaction {
  date: string; // YYYY-MM-DD
  description: string;
  amount: string;
  type: "income" | "expense" | "transfer";
  category?: string;
  reference?: string;
  account?: string;
  source?: string;
}

const DEMO_TRANSACTIONS: SeedTransaction[] = [
  // ------- Revenue (Sales / Services) -------
  { date: "2026-06-03", description: "CUSTOMER PAYMENT - DRESS", amount: "45000.00", type: "income", category: "Sales", account: "Moniepoint Business" },
  { date: "2026-06-10", description: "INSTAGRAM SALES - WEEK 23", amount: "78000.00", type: "income", category: "Sales", account: "Opay Wallet" },
  { date: "2026-06-17", description: "WHATSAPP ORDER PAYMENT", amount: "32000.00", type: "income", category: "Sales", account: "Moniepoint Business" },
  { date: "2026-06-24", description: "CUSTOMER PAYMENT - ANKARA", amount: "56000.00", type: "income", category: "Sales", account: "GTBank Current" },
  { date: "2026-07-02", description: "CUSTOMER PAYMENT - STYLE", amount: "41000.00", type: "income", category: "Sales", account: "Moniepoint Business" },
  { date: "2026-07-08", description: "INSTAGRAM SALES - WEEK 27", amount: "92000.00", type: "income", category: "Sales", account: "Opay Wallet" },
  { date: "2026-07-15", description: "WHOLESALE ORDER - RETAIL", amount: "120000.00", type: "income", category: "Sales", account: "GTBank Current" },
  { date: "2026-07-22", description: "CUSTOMER PAYMENT - JUMPSUIT", amount: "24500.00", type: "income", category: "Sales", account: "Moniepoint Business" },
  { date: "2026-07-29", description: "CUSTOMER PAYMENT - KAFTAN", amount: "38000.00", type: "income", category: "Sales", account: "Moniepoint Business" },
  { date: "2026-08-05", description: "INSTAGRAM SALES - WEEK 31", amount: "103000.00", type: "income", category: "Sales", account: "Opay Wallet" },
  { date: "2026-08-12", description: "CUSTOMER PAYMENT - GOWN", amount: "67000.00", type: "income", category: "Sales", account: "GTBank Current" },
  { date: "2026-08-19", description: "WHATSAPP ORDER PAYMENT", amount: "29000.00", type: "income", category: "Sales", account: "Moniepoint Business" },
  { date: "2026-08-26", description: "CUSTOMER PAYMENT - SUIT", amount: "54000.00", type: "income", category: "Sales", account: "Moniepoint Business" },
  { date: "2026-08-28", description: "TAILORING SERVICE - ALTER", amount: "18500.00", type: "income", category: "Services", account: "Opay Wallet" },
  { date: "2026-06-18", description: "DELIVERY PARTNER - LOGISTIC", amount: "12000.00", type: "expense", category: "Transportation", account: "Opay Wallet" },
  { date: "2026-07-16", description: "FULFILMENT - TRIP", amount: "15000.00", type: "expense", category: "Transportation", account: "Opay Wallet" },
  { date: "2026-07-21", description: "DELIVERY UBER", amount: "9000.00", type: "expense", category: "Transportation", account: "Opay Wallet" },
  { date: "2026-08-06", description: "RIDE BY BOLT", amount: "8000.00", type: "expense", category: "Transportation", account: "Opay Wallet" },
  { date: "2026-06-09", description: "MTN DATA", amount: "5000.00", type: "expense", category: "Utilities", account: "Opay Wallet" },
  { date: "2026-07-11", description: "MTN DATA", amount: "5500.00", type: "expense", category: "Utilities", account: "Opay Wallet" },
  { date: "2026-08-10", description: "MTN DATA", amount: "5200.00", type: "expense", category: "Utilities", account: "Opay Wallet" },
  { date: "2026-06-12", description: "FB AD SPEND", amount: "18000.00", type: "expense", category: "Marketing", account: "GTBank Current" },
  { date: "2026-07-14", description: "META ADS", amount: "24000.00", type: "expense", category: "Marketing", account: "GTBank Current" },
  { date: "2026-08-13", description: "INSTAGRAM BOOST", amount: "14500.00", type: "expense", category: "Marketing", account: "GTBank Current" },
  { date: "2026-06-15", description: "FABRIC SUPPLIER - ANKARA", amount: "95000.00", type: "expense", category: "Inventory", account: "GTBank Current" },
  { date: "2026-06-20", description: "FABRIC SUPPLIER - LACE", amount: "110000.00", type: "expense", category: "Inventory", account: "GTBank Current" },
  { date: "2026-07-18", description: "FABRIC SUPPLIER - MATERIAL", amount: "87000.00", type: "expense", category: "Inventory", account: "GTBank Current" },
  { date: "2026-08-14", description: "FABRIC SUPPLIER - MATERIAL", amount: "124000.00", type: "expense", category: "Inventory", account: "GTBank Current" },
  { date: "2026-06-01", description: "SHOP RENT", amount: "120000.00", type: "expense", category: "Rent", account: "GTBank Current" },
  { date: "2026-07-01", description: "SHOP RENT", amount: "120000.00", type: "expense", category: "Rent", account: "GTBank Current" },
  { date: "2026-08-01", description: "SHOP RENT", amount: "120000.00", type: "expense", category: "Rent", account: "GTBank Current" },
  { date: "2026-06-28", description: "STAFF SALARY", amount: "60000.00", type: "expense", category: "Salaries", account: "GTBank Current" },
  { date: "2026-07-30", description: "STAFF SALARY", amount: "65000.00", type: "expense", category: "Salaries", account: "GTBank Current" },
  { date: "2026-08-29", description: "STAFF SALARY", amount: "65000.00", type: "expense", category: "Salaries", account: "GTBank Current" },
  { date: "2026-06-22", description: "SOFTWARE SUBSCRIPTION", amount: "12000.00", type: "expense", category: "Software", account: "GTBank Current" },
  { date: "2026-07-23", description: "SOFTWARE SUBSCRIPTION", amount: "12000.00", type: "expense", category: "Software", account: "GTBank Current" },
  { date: "2026-08-22", description: "SOFTWARE SUBSCRIPTION", amount: "13500.00", type: "expense", category: "Software", account: "GTBank Current" },
  { date: "2026-06-05", description: "BANK CHARGES", amount: "750.00", type: "expense", category: "Banking", account: "GTBank Current" },
  { date: "2026-07-05", description: "BANK CHARGES", amount: "800.00", type: "expense", category: "Banking", account: "GTBank Current" },
  { date: "2026-08-05", description: "BANK CHARGES", amount: "850.00", type: "expense", category: "Banking", account: "GTBank Current" },
  { date: "2026-06-08", description: "STORE SNACKS - STAFF", amount: "4500.00", type: "expense", category: "Food", account: "Opay Wallet" },
  { date: "2026-07-25", description: "EQUIPMENT - SEWING MACHINE", amount: "75000.00", type: "expense", category: "Equipment", account: "GTBank Current" },
  { date: "2026-08-03", description: "TAILORING SHOP - SUPPLIES", amount: "28000.00", type: "expense", category: "Other", account: "Opay Wallet" },
  // ------- Transfers (owner drawings / inter-account) -------
  { date: "2026-06-30", description: "TRANSFER TO SAVINGS", amount: "50000.00", type: "transfer", account: "GTBank Current" },
  { date: "2026-07-31", description: "TRANSFER TO SAVINGS", amount: "55000.00", type: "transfer", account: "GTBank Current" },
  { date: "2026-08-31", description: "TRANSFER TO SAVINGS", amount: "60000.00", type: "transfer", account: "GTBank Current" },
];

/* ------------------------------------------------------------
 * A few deterministic learned rules so Settings -> Rules shows data
 * (mirrors how category learning persists corrections).
 * ------------------------------------------------------------ */
const DEMO_RULES: { pattern: string; category: string }[] = [
  { pattern: "MTN", category: "Utilities" },
  { pattern: "UBER", category: "Transportation" },
  { pattern: "BOLT", category: "Transportation" },
  { pattern: "META", category: "Marketing" },
];

/* ------------------------------------------------------------
 * main
 * ------------------------------------------------------------ */
async function main() {
  const reset = process.argv.includes("--reset");

  const gate = demoSeedAllowed(process.env);
  if (!gate.allowed) {
    throw new Error(gate.reason);
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "Demo seed requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (to create/confirm the demo auth user). See .env.example.",
    );
  }

  const prisma = getPrismaClient();
  if (!prisma) throw new Error("DATABASE_URL is not configured.");

  /* 1. Resolve the demo Supabase auth user (create + confirm if absent). */
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: existing, error: lookupError } = await admin.auth.admin.listUsers();
  if (lookupError) throw new Error(`Unable to look up demo user: ${lookupError.message}`);
  const demoAuthUser = existing?.users.find((u) => u.email === DEMO_EMAIL) ?? null;

  let demoUserId: string;
  if (demoAuthUser) {
    demoUserId = demoAuthUser.id;
  } else {
    // The password is never embedded in source: it is read from the
    // environment at runtime and only ever used to create a fresh demo user in
    // a development/test environment (gate enforced above).
    const demoPassword = demoPasswordFromEnv(process.env);
    if (!demoPassword) {
      throw new Error(
        `Creating the demo auth user requires the ${DEMO_PASSWORD_ENV} env var ` +
          "(development-only value; see .env.example). The demo user already exists " +
          "for databases where it was seeded previously, so refresh runs do not need it.",
      );
    }
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: DEMO_EMAIL,
      password: demoPassword,
      email_confirm: true,
      user_metadata: { name: DEMO_NAME },
    });
    if (createError) throw new Error(`Unable to create demo user: ${createError.message}`);
    demoUserId = created.user.id;
    console.log(`Created demo auth user ${DEMO_EMAIL}.`);
  }

  /* 2. Mirror the public.users profile row. */
  await prisma.user.upsert({
    where: { id: demoUserId },
    update: { email: DEMO_EMAIL, name: DEMO_NAME },
    create: { id: demoUserId, email: DEMO_EMAIL, name: DEMO_NAME },
  });

  /* 3. Resolve the demo business (create if absent). */
  let demoBusiness = await prisma.business.findFirst({
    where: { userId: demoUserId },
    orderBy: { createdAt: "asc" },
  });
  if (!demoBusiness) {
    demoBusiness = await prisma.business.create({
      data: {
        userId: demoUserId,
        name: DEMO_BUSINESS_NAME,
        type: DEMO_BUSINESS_TYPE,
        country: DEMO_COUNTRY,
        currency: DEMO_CURRENCY,
        size: "small",
        goals: ["Track monthly profit", "Control inventory spending"],
      },
    });
    console.log(`Created demo business "${DEMO_BUSINESS_NAME}".`);
  }
  const businessId = demoBusiness.id;

  /* 4. Reset: delete ONLY this demo business's rows (production untouched). */
  if (reset) {
    await prisma.categoryRule.deleteMany({ where: { businessId } });
    await prisma.import.deleteMany({ where: { businessId } });
    await prisma.insight.deleteMany({ where: { businessId } });
    await prisma.transaction.deleteMany({ where: { businessId } });
    await prisma.account.deleteMany({ where: { businessId } });
    console.log(`Reset demo business data for "${DEMO_BUSINESS_NAME}".`);
  }

  /* 5. Ensure system categories exist (already idempotent). */
  await ensureSystemCategories(prisma);
  const categoryByName = new Map<string, string>();
  const systemCategories = await prisma.category.findMany({ where: { businessId: null } });
  const systemByKey = new Map(systemCategories.map((c) => [`${c.type}:${c.name}`, c.id]));
  for (const c of systemCategories) categoryByName.set(`${c.type}:${c.name}`, c.id);
  const sys = (name: string, type: "income" | "expense") => systemByKey.get(`${type}:${name}`);

  /* 6. Create demo accounts (idempotent by name). */
  const accountByName = new Map<string, string>();
  for (const acc of DEMO_ACCOUNTS) {
    const existingAcc = await prisma.account.findFirst({
      where: { businessId, name: acc.name },
      select: { id: true },
    });
    if (existingAcc) {
      accountByName.set(acc.name, existingAcc.id);
      continue;
    }
    const createdAcc = await prisma.account.create({
      data: {
        businessId,
        name: acc.name,
        institution: acc.institution,
        currency: DEMO_CURRENCY,
      },
      select: { id: true, name: true },
    });
    accountByName.set(createdAcc.name, createdAcc.id);
  }

  /* 7. Create train of transactions (idempotent: skip when fingerprint exists). */
  const existingFingerprints = new Set(
    (await prisma.transaction.findMany({
      where: { businessId, fingerprint: { not: null } },
      select: { fingerprint: true },
    })).map((t) => t.fingerprint).filter(Boolean) as string[],
  );

  for (const txn of DEMO_TRANSACTIONS) {
    const categoryId =
      txn.type !== "transfer" && txn.category ? sys(txn.category, txn.type) : null;
    const accountId = txn.account ? accountByName.get(txn.account) : null;
    const fingerprint = transactionFingerprint({
      date: txn.date,
      type: txn.type,
      description: txn.description,
      amount: txn.amount,
      reference: txn.reference ?? null,
    });
    if (existingFingerprints.has(fingerprint)) continue;

    await prisma.transaction.create({
      data: {
        businessId,
        accountId,
        date: new Date(`${txn.date}T00:00:00Z`),
        description: txn.description,
        amount: txn.amount,
        type: txn.type,
        categoryId,
        source: txn.source ?? "bank",
        reference: txn.reference ?? null,
        fingerprint,
      },
    });
  }

  /* 8. Create learned category rules (idempotent via unique constraint). */
  for (const rule of DEMO_RULES) {
    const categoryId = sys(rule.category, "expense");
    const existingRule = await prisma.categoryRule.findFirst({
      where: { businessId, matchType: "merchant", pattern: rule.pattern },
      select: { id: true },
    });
    if (existingRule) continue;
    await prisma.categoryRule.create({
      data: {
        businessId,
        matchType: "merchant",
        pattern: rule.pattern,
        categoryId,
        categoryName: rule.category,
      },
    });
  }

  /* 9. Summary. */
  const txCount = await prisma.transaction.count({ where: { businessId } });
  console.log("--------------------------------------------------");
  console.log(`Demo business : ${DEMO_BUSINESS_NAME}`);
  console.log(`Sign-in email  : ${DEMO_EMAIL}`);
  console.log(
    `Sign-in pass   : set via ${DEMO_PASSWORD_ENV} (development only; never printed)`,
  );
  console.log(`Transactions   : ${txCount} (${txCount === 0 ? "none" : "present"})`);
  console.log(`Reset          : run "npm run db:seed -- --reset" to refresh`);
  console.log("--------------------------------------------------");
}

main().catch((e) => {
  console.error(`Demo seed failed: ${e.message}`);
  process.exit(1);
});
