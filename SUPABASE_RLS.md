# Supabase RLS & the Prisma Data-Access Strategy

**LedgerAI security model: how authentication flows to database authorization.**

## TL;DR

- **Supabase Row-Level Security (RLS) is the PRIMARY boundary for direct/data-plane access** to the database.
- The **Prisma client connects with the elevated (service) connection string**, which **bypasses RLS by design**. This is intentional and standard: Prisma runs on the trusted Next.js server, not the client.
- Because Prisma bypasses RLS, **every service-layer operation MUST enforce tenant isolation itself**: derive the active user from the authenticated server-side session, resolve that user's `business_id`, and scope every query/filter to that `business_id`. The service layer never trusts client-supplied IDs as the sole authority.
- If a Supabase client is ever used to run user-facing queries directly (e.g. a future realtime/subscription path), those tables must have RLS policies and be queried with the anon role, never the service role.

## Authentication → Database authorization flow

```
Browser
  │  Supabase Auth (email/password, JWT session)
  ▼
Next.js Server (Server Action / Route Handler)
  │  (createServerClient from @supabase/ssr)
  │  read session cookie -> getUser()
  ▼
Authenticated user { id, email }
  │  resolve business via users -> businesses (businessId = the user's active business)
  ▼
Service layer  (src/lib/services)  -- TENANT-SCOPED ---------------------------------
  │  every query: { businessId: <derived>, ... }
  │  never uses a client-supplied businessId as the only filter
  ▼
Prisma Client (src/lib/db/client.ts) via @prisma/adapter-pg (service connection string)
  │  (bypasses RLS intentionally)
  ▼
PostgreSQL (Supabase)
```

### Why Prisma bypasses RLS
The Prisma client authenticates to Postgres with the Supabase **service role** (or the database owner) connection string. That identity is considered `bypassrls`-capable, so RLS policies do not restrict it. This is the **standard Supabase + Prisma pattern** — it keeps a single trusted path for all server-side reads/writes.

The consequence is that **authorization becomes a server responsibility**. We enforce it in exactly one place (the service layer), so it cannot be forgotten in a route handler.

## Service-layer tenant isolation rules

1. **Always** query with `where: { businessId }`.
2. Never accept a raw `businessId` from the client and use it verbatim — resolve it from the session.
3. Cross-user leakage is prevented by deriving `businessId` from the authenticated user's own business record.
4. Read-only user data that must never cross users: transactions, categories, accounts, imports, insights.

## RLS policies (defense-in-depth for any direct access)

Even though Prisma bypasses RLS, all tables carry RLS policies so that **any** future direct access (Supabase anon client, SQL editor queries, raw connections) is also isolated. Standard policy shape:

```sql
-- Example: transactions
alter table transactions enable row level security;

create policy "users access own business transactions"
on transactions for all
using (
  exists (
    select 1 from businesses b
    where b.id = transactions.business_id
      and b.user_id = auth.uid()
  )
);
```

Apply the same pattern to `accounts`, `categories`, `imports`, `insights`, and `category_rules`.

## Never

- Expose the service-role key to the browser (`SUPABASE_SERVICE_ROLE_KEY` is server-only).
- Let any route handler query without scoping to the session-derived `businessId`.
- Store or log raw financial descriptions in error logs.
