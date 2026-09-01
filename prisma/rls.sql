-- ============================================================
-- LedgerAI — Supabase RLS + Auth-linking setup (applied directly
-- against the live Supabase database, NOT via Prisma Migrate).
-- ------------------------------------------------------------
-- Rationale: Prisma Migrate validates each migration against a fresh
-- shadow database that does NOT contain Supabase's managed `auth`
-- schema. These statements reference `auth.users` and `auth.uid()`, so
-- they cannot be part of a Prisma migration. They are idempotent and
-- safe to re-run.
--
-- Run: pnpm tsx prisma/apply-rls.ts   (or apply via Supabase SQL editor)
-- ============================================================

-- 1) Link app profile to Supabase Auth user.
--    `public.users.id` mirrors `auth.users.id` from Supabase Auth.
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_id_auth_fkey";
ALTER TABLE "users"
  ADD CONSTRAINT "users_id_auth_fkey"
  FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 2) Helper: is the current user the owner of a given business?
CREATE OR REPLACE FUNCTION public.is_owner(target_business_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER -- resolves tables as the function owner (service) regardless of caller role
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM businesses b
    WHERE b.id = target_business_id
      AND b.user_id = auth.uid()
  );
$$;

-- ---- users ---------------------------------------------------------------
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users can read own profile" ON "users";
CREATE POLICY "users can read own profile"
  ON "users" FOR SELECT
  USING (id = auth.uid());

DROP POLICY IF EXISTS "users can update own profile" ON "users";
CREATE POLICY "users can update own profile"
  ON "users" FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- ---- businesses -----------------------------------------------------------
ALTER TABLE "businesses" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner can read own businesses" ON "businesses";
CREATE POLICY "owner can read own businesses"
  ON "businesses" FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "owner can insert own businesses" ON "businesses";
CREATE POLICY "owner can insert own businesses"
  ON "businesses" FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "owner can update own businesses" ON "businesses";
CREATE POLICY "owner can update own businesses"
  ON "businesses" FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "owner can delete own businesses" ON "businesses";
CREATE POLICY "owner can delete own businesses"
  ON "businesses" FOR DELETE
  USING (user_id = auth.uid());

-- ---- accounts ------------------------------------------------------------
ALTER TABLE "accounts" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users access own business accounts" ON "accounts";
CREATE POLICY "users access own business accounts"
  ON "accounts" FOR ALL
  USING (public.is_owner(business_id))
  WITH CHECK (public.is_owner(business_id));

-- ---- categories -----------------------------------------------------------
-- Custom categories are owner-scoped; SYSTEM defaults (business_id IS NULL)
-- are readable by any authenticated user but only writable via service role.
ALTER TABLE "categories" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users read own and system categories" ON "categories";
CREATE POLICY "users read own and system categories"
  ON "categories" FOR SELECT
  USING (business_id IS NULL OR public.is_owner(business_id));

DROP POLICY IF EXISTS "users insert own business categories" ON "categories";
CREATE POLICY "users insert own business categories"
  ON "categories" FOR INSERT
  WITH CHECK (public.is_owner(business_id));

DROP POLICY IF EXISTS "users update own business categories" ON "categories";
CREATE POLICY "users update own business categories"
  ON "categories" FOR UPDATE
  USING (public.is_owner(business_id))
  WITH CHECK (public.is_owner(business_id));

DROP POLICY IF EXISTS "users delete own business categories" ON "categories";
CREATE POLICY "users delete own business categories"
  ON "categories" FOR DELETE
  USING (public.is_owner(business_id));

-- ---- transactions ---------------------------------------------------------
ALTER TABLE "transactions" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users access own business transactions" ON "transactions";
CREATE POLICY "users access own business transactions"
  ON "transactions" FOR ALL
  USING (public.is_owner(business_id))
  WITH CHECK (public.is_owner(business_id));

-- ---- imports --------------------------------------------------------------
ALTER TABLE "imports" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users access own business imports" ON "imports";
CREATE POLICY "users access own business imports"
  ON "imports" FOR ALL
  USING (public.is_owner(business_id))
  WITH CHECK (public.is_owner(business_id));

-- ---- insights -------------------------------------------------------------
ALTER TABLE "insights" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users access own business insights" ON "insights";
CREATE POLICY "users access own business insights"
  ON "insights" FOR ALL
  USING (public.is_owner(business_id))
  WITH CHECK (public.is_owner(business_id));

-- ---- category_rules -------------------------------------------------------
ALTER TABLE "category_rules" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users access own business category rules" ON "category_rules";
CREATE POLICY "users access own business category rules"
  ON "category_rules" FOR ALL
  USING (public.is_owner(business_id))
  WITH CHECK (public.is_owner(business_id));