# LedgerAI

A bookkeeping assistant for small businesses. Import bank statements, keep clean books, and get plain-language answers about cash flow — without spreadsheets or accounting jargon.

LedgerAI turns raw transactions into organised income, expenses, and profit reports; categorises rows with deterministic rules (no black box); and offers an AI-assisted insight and Q&A layer that always works, with or without an API key.

## Features (MVP)

- **Auth & multi-tenant workspace** — email/password sign-up and sign-in via Supabase Auth; every row scoped to your business; Postgres RLS as defence in depth.
- **Onboarding** — a short guided setup (business name, type, country, currency, size) the first time you sign in.
- **Transactions** — list, create, edit, and delete with inline validation, search, filters, and CSV export.
- **Categories & rules** — system defaults plus custom categories; categorisation rules with preview-before-save; imports learn from your corrections.
- **Imports** — CSV, Excel (`.xlsx`), and PDF bank-statement import with column mapping, duplicate detection (fingerprint: date + amount + description + reference + account), per-row review, and one atomic commit.
- **Reports** — summary, monthly, category, income statement, expense breakdown, and profit (P&L) reports with CSV export, plus browser print-to-PDF.
- **Insights** — deterministic month-over-month analysis: what changed, why, and what to watch.
- **Ask** — natural-language questions over your own ledger with a deterministic answer path; an LLM-backed mode is opt-in and disabled by default (`ASK_V2_ENABLED=false`).
- **Security** — per-request CSP with nonce, security headers, Zod validation everywhere, rate limits on auth/import/AI routes, upload size and type limits, secrets server-only.

## Tech stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 16.4.6 (App Router, Server Actions, `proxy.ts`) |
| UI | React 19, Tailwind CSS v4, in-house UI primitives, Recharts |
| Auth | Supabase Auth (GoTrue) + `@supabase/ssr` cookies |
| Database | Postgres (Supabase) with Prisma 7 |
| Parsing | `papaparse` (CSV), `xlsx` (Excel), `pdf-parse` (PDF statements) |
| Validation | Zod 4 |
| Tests | Vitest (unit + integration), v8 coverage |

## Getting started

### Prerequisites

- Node.js 20+
- A Postgres database (e.g. a Supabase project)

### Setup

```bash
git clone https://github.com/zootodev/ledgerAI.git
cd ledgerAI
npm install                # runs `prisma generate` via postinstall
cp .env.example .env       # then fill in real values (never commit .env)
npx prisma migrate deploy  # apply committed migrations
npm run dev
```

Open http://localhost:3000.

### Environment variables

All configuration is documented inline in [`.env.example`](.env.example). The short version:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string (use the direct connection for migrations) |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase project + anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server-only.** Admin operations (e.g. account deletion) |
| `AI_PROVIDER`, `AI_API_KEY`, `AI_MODEL` | Optional LLM provider; deterministic fallbacks work without a key |
| `ASK_V2_ENABLED` | Independent gate for the `/ask-v2` surface — default `false` |
| `SEED_ALLOW`, `SEED_DEMO_PASSWORD` | Dev/test-only demo seed; refused when `NODE_ENV=production` |
| `NEXT_PUBLIC_APP_URL` | Public base URL for emailed links (empty in dev = derived from request) |

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript, no emit |
| `npm test` | Vitest, single run |
| `npm run test:watch` | Vitest in watch mode |
| `npm run test -- --coverage` | Vitest with coverage (thresholds enforced on `src/lib/finance`) |
| `npm run db:generate` | Regenerate the Prisma client |
| `npx prisma migrate deploy` | Apply committed migrations |

## Testing

- 2140 passing, 11 skipped across 171 test files.
- Unit and integration tests live in `tests/`, mirroring `src/` structure.
- Tests are hermetic: database-dependent evaluation suites skip themselves when no test database is configured (they are the only skipped tests in a default run).
- Coverage thresholds are enforced on the core accounting engine (`src/lib/finance/**`) — the code where correctness matters most.

## CI

Every pull request runs lint, typecheck, and the test suite; builds run on `main`. See [`.github/workflows/ci.yml`](.github/workflows/ci.yml). No secrets are required for CI — tests run against mocks/fixtures.

## Project structure

```
src/
  app/            Routes (App Router): transactions, reports, imports,
                  settings, ask, insights, onboarding, auth callbacks
  components/     UI primitives (ui/) and feature components
  lib/
    finance/      Deterministic engine: normalisation, validation, calculations
    import/       Parsers (CSV/XLSX/PDF), mapping, dedupe, categorisation
    services/     Data access (Prisma) and business logic
    actions/      Server actions
    validation/   Zod schemas
    security/     Rate limits, headers, CSP helpers
  proxy.ts        Per-request middleware: CSP nonce, auth guards, routing
prisma/           Schema, migrations, dev seed (hard-gated)
tests/            Vitest suites
```

## Security notes

- Never commit `.env` or real credentials; `.env.example` documents the shape only.
- The service-role key and AI keys are server-only; the anon key is the only browser-visible credential.
- The demo seed refuses to run in production and its password comes from the environment, never source.
- Account deletion uses the Supabase Admin API with strict post-verification checks.

## Deployment

Deploys to [Vercel](https://vercel.com) as a Next.js app. Set the environment variables above in the project settings, point `NEXT_PUBLIC_APP_URL` at the production URL, and allow that URL in Supabase Auth → URL Configuration. Apply migrations with `npx prisma migrate deploy` against the production database as part of your release process.
