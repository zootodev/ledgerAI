# LedgerAI — Technical & Product Blueprint

> AI-powered financial intelligence for small businesses.
> Turn bank statements and transaction records into clear financial insights, reports, and smarter decisions.

**Document version:** 1.0
**Status:** Draft for review — no implementation yet

---

## 1. Product Summary

LedgerAI is a production-quality, AI-powered financial intelligence SaaS for small businesses, initially targeting the Nigerian/African small-business market with Nigerian Naira (₦) as the default currency. It lets business owners import financial records (CSV, XLSX, PDF statements, manual entry), automatically extract and categorize transactions, review AI decisions, and gain real financial insights — dashboards, reports, charts, and actionable AI recommendations.

The core experience is a controlled pipeline:

**Import → Extract → Categorize → Review → Analyze → Understand → Act**

LedgerAI is *not* an expense tracker, CRUD demo, chatbot wrapper, or enterprise accounting suite. It is a trustworthy fintech product built on deterministic financial calculations with AI used only where it adds genuine value (categorization, insight narration, Q&A) — never for arithmetic.

### Core principles

- **Trust** — financial software must feel reliable.
- **Transparency** — AI explains its reasoning and confidence.
- **Human control** — AI never silently mutates financial data.
- **Simplicity** — complex information made easy to grasp.
- **Accuracy** — all math is deterministic application code.
- **Privacy** — financial data is treated as highly sensitive.
- **Progressive disclosure** — no overwhelming every metric at once.
- **Professionalism** — every screen feels like a real SaaS product.

---

## 2. Problem Statement

Small business owners — online vendors, Instagram/WhatsApp sellers, freelancers, agencies, food and fashion businesses — rarely have accounting systems. They rely on scattered bank statements, WhatsApp messages, Excel/Google Sheets, notebooks, receipts, and mental math. Consequences:

1. They don't reliably know how much they earned or spent.
2. They can't identify profit or where money goes.
3. They make decisions on guesswork, not data.
4. They miss tax-relevant records and growth trends.
5. Existing tools are either enterprise-grade accounting software (too complex) or simple trackers (no intelligence).

LedgerAI bridges that gap: an approachable, professional tool that ingests raw financial records and returns organized data, dashboards, reports, and AI-driven insights — without requiring accounting knowledge.

**Solutions LedgerAI provides:**

- How much did I make / spend? → **Dashboard**
- What is my profit? → **Profit & margin metrics**
- Where is my money going? → **Expense breakdown**
- Which expenses increased? → **Analytics & insights**
- Is my business improving? → **Trends & period comparison**
- Which transactions need attention? → **Review queue & anomalies**
- What should I do? → **AI recommendations**

---

## 3. Target Users

### Primary personas

| Persona | Profile | Pain points | LedgerAI fit |
|---|---|---|---|
| **Ngozi** | Instagram/WhatsApp fashion seller (Zooto Fashion Store) | Mixes business & personal money, no records | Affordable import + clear income/expense separation |
| **Tunde** | Freelance developer / agency owner | Multiple clients, sporadic income, no expense tracking | Revenue tracking, profit visibility, AI categorization |
| **Amina** | Small food business (catering) | Supplier costs, delivery, unpredictable spend | Expense breakdown, top expense categories |
| **Chidi** | Retail shop owner | Bank statements pile up, no time to enter data | CSV/PDF import, auto-categorization |
| **Kelechi** | Service business (repairs) | Can't see which services are profitable | Income vs expense analytics, reports |

### Explicitly NOT the target
- Enterprise accounting teams needing GL, journal entries, multi-currency consolidation.
- Businesses requiring tax-law compliance or licensed accounting.

---

## 4. User Personas (Detail)

### Persona 1 — "Ngozi" (Primary)
- **Role:** Owner of an Instagram/WhatsApp fashion reselling business.
- **Age:** 27. **Tech comfort:** High on social apps, low on financial software.
- **Goal:** Know profit each month, and stop "money disappearing."
- **Behaviour:** Willing to upload a GTBank/Opay/Moniepoint CSV statement. Wants it done fast, corrects wrong categories rarely.
- **Frustration:** Excel is intimidating. "I just want to know what I made."

### Persona 2 — "Tunde"
- **Role:** Freelance developer / solo agency.
- **Goal:** Track income by client/project, maximize profit margin.
- **Behaviour:** Enters transactions manually or imports, uses AI Insights and Q&A ("spend on software last month?").
- **Frustration:** No overview across months; ad-hoc invoices.

### Persona 3 — "Chidi"
- **Role:** Retail shop owner with high transaction volume from a POS (Moniepoint).
- **Goal:** Automate as much as possible, spot theft/leakage and duplicate entries.
- **Behaviour:** Imports large CSV files; relies on duplicate detection and review queue.

---

## 5. User Stories

**Authentication & Onboarding**
- As a new user, I can sign up with email and password so I get a secure workspace.
- As a new user, I can complete a short onboarding to personalize my business (name, type, country, currency, size).
- As a returning user, I can log in and stay logged in, and reset my password if forgotten.
- As a user, I can log out and my session is invalidated.

**Transactions**
- As a user, I can add an income/expense/transfer transaction with validation.
- As a user, I can see all transactions in a searchable, filterable, sortable, paginated table.
- As a user, I can open a transaction, see details including AI confidence, and edit/correct/delete it.
- As a user, transfers are never counted as income or expense.

**Import**
- As a user, I can import CSV/XLSX/PDF statements via a guided multi-step wizard.
- As a user, I can preview extracted transactions before saving.
- As a user, I can re-map columns when auto-detection fails.
- As a user, I can review low-confidence/uncertain transactions before import.
- As a user, I am warned about possible duplicate transactions and choose keep/skip/review.
- As a user, I get clear, actionable errors (never "Error 500").

**Analytics & Insights**
- As a user, I see revenue, expenses, net profit, and margin with prior-period comparison.
- As a user, I see meaningful charts (revenue vs expenses, expense breakdown, trends, top categories).
- As a user, I can filter by date range.
- As a user, I receive AI insights based on real calculated metrics, with explanations.
- As a user, I can ask LedgerAI questions backed by verified data.

**Reports**
- As a user, I can generate monthly/income/expense/profit/category reports from real data and export CSV/PDF.

**Empty/Loading/Error states**
- As a user, I never see blank tables or hanging screens — always clear empty, loading, and error states with recovery actions.

---

## 6. Core User Journeys

### Journey A — First-run activation
1. Landing page → Get Started.
2. Sign up → verify email (optional in MVP) → create account.
3. Onboarding: business name, type, country, currency, size.
4. Land on Overview with a helpful empty state: "Import your first statement." CTA: *Import Transactions*.
5. (Optionally add manual transaction or load demo data.)

### Journey B — Import a statement
1. Overview → Import Transactions.
2. Step 1: Upload CSV/XLSX/PDF (drag & drop or browse).
3. Step 2: format detected → extract → validate.
4. Step 3: preview parsed transactions.
5. Step 4: AI categorization (confidence shown), uncertain rows flagged.
6. Step 5: resolve duplicates (keep/skip/review).
7. Step 6: confirm → save → success summary ("184 imported, 8 flagged for review").
8. Navigate to Overview; numbers now reflect real data.

### Journey C — Investigate & act on insight
1. AI Insights page lists insights grouped by topic.
2. User opens "Transportation spending increased 31%".
3. Insight shows source data (category totals this month vs last month) and explanation.
4. User navigates to Transactions filtered to Transportation to investigate.

### Journey D — Correct a category
1. Transaction table → click row → detail drawer.
2. See "AI suggested: Transportation · Confidence 96%".
3. Change category → save → correction recorded for future learning.

### Journey E — Run a report
1. Reports → choose type + date range → Run.
2. See summary + charts + totals from real data.
3. Export CSV or PDF.

---

## 7. MVP Feature List

### In scope (MVP)
- **Auth:** signup, login, logout, forgot/reset password, session management, protected routes, profile.
- **Onboarding:** business profile (name, type, country, currency, size, optional goals). 1–3 steps.
- **Shell:** responsive sidebar, mobile nav, profile menu, notification area.
- **Overview dashboard:** revenue, expenses, net profit, margin with prior-period deltas; key charts; period selector (week/month/quarter/year/custom).
- **Transactions:** CRUD; search; filter (date, category, type, account); sort; pagination; detail drawer/edit/delete; transfers excluded from P&L.
- **Categories:** built-in set + custom categories; deterministic merchant/category rules.
- **Import:** multi-step wizard for CSV/XLSX/PDF; column mapping; preview; validation; duplicate detection; review queue; AI categorization; confirm & save.
- **Analytics:** revenue vs expenses, expense breakdown (donut), revenue trend, expense trend, profit trend, top expense categories.
- **AI categorization + confidence + review + learning from corrections (rules engine).**
- **AI Insights:** key insights, spending, revenue, profitability, anomalies, recommendations (LLM-narrated, deterministic data).
- **AI Assistant (Ask LedgerAI):** natural-language Q&A over verified data with structured query generation.
- **Reports:** monthly/income/expense/profit/category + CSV export (+ PDF where practical).
- **Demo mode:** isolated fictional seed data ("Zooto Fashion Store") + reset.
- **Design system, accessibility, responsive, loading/empty/error states.**
- **Health/robustness:** logging of failures (no sensitive data), Zod validation, server-side validation.

### Post-MVP (V2+ roadmap — architecture only)
- V2: Receipt OCR, recurring transactions, custom rules UI, forecasting, email/scheduled reports, multiple businesses, team members.
- V3: WhatsApp import, payment integrations (Paystack/Flutterwave), bank APIs/Open Banking where legal, invoices, receipt matching.
- V4: AI financial planning, benchmarking, predictive cash flow, advanced anomaly detection, advanced forecasting.

---

## 8. Information Architecture

```
LedgerAI
├── Public (marketing)
│   ├── Landing
│   ├── Pricing (later)
│   └── Help/FAQ
├── Auth
│   ├── Sign In
│   ├── Sign Up
│   ├── Forgot Password
│   └── Reset Password
├── Onboarding
│   └── Business setup
├── App (authenticated shell)
│   ├── Overview (Dashboard)
│   ├── Transactions
│   │   ├── List
│   │   └── Detail (drawer)
│   ├── Income
│   ├── Expenses
│   ├── Reports
│   ├── AI Insights
│   ├── Import (wizard)
│   └── Settings
│       ├── Profile
│       ├── Business
│       ├── Categories
│       ├── Accounts
│       └── Import history
```

---

## 9. Screen / Page Inventory

| Screen | Variants/states | Priority |
|---|---|---|
| Landing page | Hero, problem, how-it-works, features, dashboard preview, AI insights, import, benefits, security, FAQ, CTA, footer | ✔ Must |
| Sign in / Sign up | Success, invalid, loading | ✔ |
| Forgot / reset password | Sent, invalid token, expired | ✔ |
| Onboarding (1–3 steps) | Progress states | ✔ |
| Overview dashboard | Loaded, empty, loading, error | ✔ |
| Transactions list | Loaded, empty, loading, filtered, search, paginated, mobile | ✔ |
| Transaction detail | Drawer/modal; read + edit modes | ✔ |
| New transaction | Form + validation error states | ✔ |
| Import wizard | 6–9 steps; upload, mapping, preview, AI review, duplicates, confirm | ✔ |
| AI Insights | Sections + cards; empty state | ✔ |
| Ask LedgerAI | Chat/Q&A; empty; "not enough data" | ✔ |
| Reports | Type list + generated view + export | ✔ |
| Settings | Profile, business, categories, accounts, import history | ✔ |
| Help/Security modal/FAQ | Where practical | Later |

---

## 10. UX Flow

```
[Landing] --Get Started--> [Sign Up] --> [Onboarding] --> [Overview]
                              |
                              +--> [Sign In] --+
                                                v
[Overview] --- Transactions --- Income --- Expenses --- Reports --- AI Insights --- Import
     |                                                                              |
     +---- Import Transactions (wizard) <-------------------------------------------+
                 |  upload -> extract -> preview -> AI categorize -> review -> confirm
                 v
           Overview updates (real data)
```

Key UX rules:
- Progressive disclosure on the dashboard (KPIs first, charts below, insights deeper).
- Import is a guided stepper with visible progress and a summary.
- Every destructive action has confirmation; delete is reversible-friendly (soft delete optional).
- All screens have empty, loading, error, and recovery states.

---

## 11. Design System Proposal

### Visual language
Modern, clean, **trustworthy**, premium, calm, data-focused fintech. Restrained palette. Minimal gradients, no glassmorphism, minimal animation. Finance-appropriate trust signals.

### Color
- **Primary (brand):** deep trustworthy indigo/blue (#2563EB family).
- **Semantic:** green = income/profit, red = expense/loss (never color-only — always paired with icon/label).
- **Neutral grays** for text/surfaces; white background; subtle borders.
- **Data/accents** for charts (accessible, distinguishable).

### Typography
- Clean sans-serif (Inter) with clear numeric tabular figures for money.
- Clear hierarchy: H1/H2/H3, body, caption, mono for codes/refs.

### Spacing/Radius/Shadows
- 4px spacing scale; uniform 8–16px radius on cards; subtle layered shadows; restrained elevation.

### Components (shared library)
`Button`, `Input`, `Select`, `Textarea`, `Checkbox`, `Switch`, `Modal`, `Drawer`, `Card`, `StatCard`, `DataTable`, `Badge`, `AIConfidenceBadge`, `Dropdown`, `Tabs`, `Accordion`, `Alert`, `EmptyState`, `ErrorState`, `Skeleton`, `Spinner`, `Chart`, `DateRangePicker`, `Stepper`, `TransactionRow`, `TransactionDetails`, `InsightCard`, `Avatar`, `Tooltip`.

### Charts
Recharts on a thin wrapper for consistent styling: line/bar/area for trends, donut for breakdowns, with tooltips, accessible labels, empty states.

---

## 12. Technical Architecture

### Stack
- **Frontend:** Next.js (App Router), TypeScript, React, Tailwind CSS, Lucide icons, Recharts.
- **Backend:** Next.js API Routes / Server Actions & Route Handlers (colocated, clean service layer). Optionally a thin separate BFF later.
- **Database:** PostgreSQL via **Supabase** (simplest for MVP) with Row-Level Security. Prisma ORM for type-safe client + migrations.
- **Auth:** Supabase Auth (email/password, password reset, sessions).
- **Storage:** Supabase Storage (private) for uploaded statements + receipts.
- **AI:** provider-agnostic service abstraction (default: an LLM via Vercel AI SDK / OpenRouter) with structured outputs (JSON schema) + validation.
- **Validation:** Zod everywhere (shared, frontend + server).
- **File parsing:** CSV (papaparse), XLSX (SheetJS), PDF (pdf-parse / pdfjs); typed parser abstraction.

### Separation of concerns
```
UI (React components)          ← presentation only
Hooks / client state           ← shallow orchestration
API routes / Server Actions    ← HTTP boundary, authz, validation
Service layer                  ← business logic (deterministic finance engine, import pipeline, insight engine)
Data access (Prisma/Supabase)  ← DB interactions, RLS-aware
AI layer                       ← provider abstraction, structured output, validation
```

### Key guardrail
**Deterministic Financial Engine (DFE)** — all revenue/expense/profit/margin/percentages/chart aggregation live in ordinary code, heavily tested. The AI only *explains* and *narrates* from verified metrics.

---

## 13. Database Schema (PostgreSQL)

```sql
users          -- Supabase auth users + extended profile
  id (uuid), email, name, created_at

businesses
  id (uuid), user_id fk, name, type, country, currency (default 'NGN'), size,
  created_at, updated_at

accounts
  id (uuid), business_id fk, name, institution, currency, created_at

categories
  id (uuid), business_id fk (nullable for system defaults), name, type
  (income|expense), is_system bool, created_at

transactions
  id (uuid), business_id fk, account_id fk, date, description, amount (numeric),
  type (income|expense|transfer), category_id fk nullable,
  source (manual|import|csv|xlsx|pdf|bank), reference, notes,
  ai_category, ai_confidence (numeric),
  fingerprint (for duplicate detection),
  created_at, updated_at
  -- indexes: (business_id, date), (business_id, type, date),
  --          (business_id, category_id, date)

imports
  id (uuid), business_id fk, filename, file_type, status,
  transactions_found, transactions_imported, errors jsonb, created_at

insights
  id (uuid), business_id fk, type, title, description, metadata jsonb,
  period_start, period_end, created_at

category_rules       -- merchant/category deterministic rules (learning from corrections)
  id (uuid), business_id fk, match_type (merchant|keyword), pattern,
  category_id fk, created_at

import_sessions
  id (uuid), business_id fk, temp_payload jsonb, status, created_at
```

- Foreign keys with `ON DELETE CASCADE` where appropriate.
- RLS policies isolate all rows by `business_id` (and thus `user_id`).
- `amount` is `numeric` (money); never float.
- `transactions.type` + `fingerprint` power deterministic duplicate detection.

---

## 14. API Architecture

Route Handlers / Server Actions grouped by domain, each: authorize → validate (Zod) → service → return.

| Domain | Endpoints |
|---|---|
| Auth | Supabase managed |
| Businesses | `GET/POST /businesses`, `PATCH /businesses/:id` |
| Accounts | `GET/POST /accounts`, `PATCH/DELETE` |
| Categories | `GET/POST /categories`, `PATCH`, system defaults |
| Transactions | `GET /transactions` (filter/paginate/search), `POST`, `GET/:id`, `PATCH/:id`, `DELETE/:id` |
| Imports | `POST /imports/upload`, `POST /imports/parse`, `POST /imports/preview`, `POST /imports/commit`, `GET /imports` |
| Analytics | `GET /analytics/summary`, `GET /analytics/breakdown`, `GET /analytics/trends`, `GET /analytics/categories` |
| AI | `POST /ai/categorize`, `POST /ai/insights/refresh`, `POST /ai/ask` |
| Reports | `POST /reports/generate`, `POST /reports/export` |

Server-side validation on every route. No business logic in components. RLS enforced at DB plus defensive service-layer scoping.

---

## 15. AI Architecture

```
                    ┌──────────────────────────────────────────────┐
                    │            AI Service (interface)            │
                    │  categorizeTransaction()                    │
                    │  generateInsights(metrics)                  │
                    │  answerFinancialQuestion(metaQuery)         │
                    └───────────────┬──────────────────────────────┘
                                    │
              ┌─────────────────────┼─────────────────────┐
              ▼                     ▼                     ▼
   LLM Provider A            LLM Provider B       Fallback (offline
   (e.g. default)            (swap-in later)      rules/heuristic)
```

- **Structured outputs** — prompt instructs JSON; Zod validates the response before display/storage.
- **Never for math** — categorize and narrate only.
- **Confidence** — model emits a confidence value; thresholds flag uncertain rows for review.
- **Learning** — user corrections feed a deterministic `category_rules` table (merchant/keyword → category) so categorization improves without model retraining in MVP.
- **Q&A** — the assistant translates questions into parameterized analytic queries over real data; answers cite the data. If data is insufficient, returns "I don't have enough data to answer that accurately."

### AI safety / disclaimer
LedgerAI presents AI output as guidance, not professional accounting/tax/finance advice. Disclaimers shown in AI surfaces.

---

## 16. File / Folder Structure

```
ledgerai/
├── public/
├── src/
│   ├── app/
│   │   ├── (marketing)/            # landing
│   │   ├── (auth)/                 # signin, signup, reset
│   │   ├── onboarding/
│   │   └── (app)/                  # authed shell
│   │       ├── overview/
│   │       ├── transactions/
│   │       ├── income/
│   │       ├── expenses/
│   │       ├── reports/
│   │       ├── insights/
│   │       ├── import/
│   │       └── settings/
│   ├── components/
│   │   ├── ui/                     # design-system primitives
│   │   ├── charts/
│   │   ├── transactions/
│   │   ├── import/
│   │   ├── insights/
│   │   ├── dashboard/
│   │   └── layout/
│   ├── lib/
│   │   ├── ai/                     # categorization, insights, assistant, provider
│   │   ├── finance/                # deterministic engine
│   │   ├── import/                 # csv, xlsx, pdf, mapping, normalize, validate, dedupe
│   │   ├── services/               # business, transaction, analytics, report, insight
│   │   ├── db/                     # prisma client, supabase
│   │   ├── validation/             # zod schemas
│   │   └── utils/
│   ├── hooks/
│   ├── types/
│   └── constants/
├── prisma/
│   ├── schema.prisma
│   └── seed/
├── tests/                          # unit + integration
├── .env.example
├── README.md
└── ...
```

---

## 17. Security Architecture

- **Auth:** Supabase Auth; passwords hashed by Supabase; JWT sessions; refresh; reset flow.
- **Authorization & isolation:** Row-Level Security keyed on `business_id`; service layer re-scopes all queries to the authenticated user's business. Never trust client-provided IDs.
- **Server-side validation:** Zod on every boundary.
- **Input sanitization** and parameterized queries (Prisma).
- **Secrets** in `.env` only; `.env.example` committed; no keys in frontend.
- **File uploads:** private storage bucket; allowlist MIME + extension; size limits; parsed client-side but revalidated server-side; PDFs parsed server-side.
- **No logging of** sensitive financial details.
- **Rate limiting** on auth + AI routes (via middleware where practical).
- **CORS / CSRF** handled appropriately for same-origin app.
- **Referrer/domain checks** for OAuth/reset callbacks.

---

## 18. Testing Strategy

- **Unit (deterministic engine):** revenue, expenses, profit, margin, deltas, date filtering, trends, breakdowns, duplicate detection, import parsing, validation. Highest priority.
- **Unit (categorization):** rules engine + AI structured-output validation + confidence thresholds.
- **Integration:** API routes (authz, CRUD), import pipeline (upload→preview→commit), insight generation with mock AI.
- **Auth tests:** signup/login/logout/reset, protected routes, RLS isolation.
- **E2E (optional later):** happy-path journeys (Signup→Onboard→Import→Dashboard→Insights→Report).
- **Tooling:** Vitest (unit/integration), Testing Library (component), Supertest for API, Playwright (E2E, later). Coverage thresholds on finance engine.

---

## 19. Development Phases

Per the master prompt, incremental and runnable after each phase.

1. **Project setup** — Next.js + TS + Tailwind + Prisma + Supabase + ESLint/Prettier + design tokens + `npm run dev` green.
2. **Design system** — UI primitives, stat cards, tables, charts, empty/loading/error, layout shell.
3. **Database + Auth** — schema, migrations, RLS, auth routes, onboarding.
4. **Core transactions** — CRUD, categories, validation, filtering/search/pagination, transfers-excluded engine.
5. **Dashboard & analytics** — summary KPIs, period comparison, charts.
6. **Import pipeline** — CSV → XLSX → PDF; mapping, preview, validation, dedupe, review, commit.
7. **AI categorization + rules + learning from corrections.**
8. **AI insights + Ask LedgerAI (structured, validated).**
9. **Reports + export.**
10. **Demo/seed data + reset.**
11. **Landing page + marketing polish.**
12. **Responsiveness, accessibility, performance.**
13. **Testing, hardening, documentation.**
14. **Git history** — logical commits per phase/feature.

Each phase ends with: what changed, why, and what to test.

---

## 20. Deployment Strategy

- **Hosting:** Vercel (Next.js SSR/ISR + edge) — recommended for MVP.
- **Database:** Supabase PostgreSQL (managed, RLS, backups).
- **Storage:** Supabase Storage (private bucket).
- **Env:** Vercel project env vars mapped from `.env` (no secrets in repo).
- **CI:** GitHub Actions — lint, typecheck, unit + integration tests on PR; build on main.
- **Preview deployments** for PRs (Vercel).
- **AI key** injected server-side only.

---

## 21. Potential Technical Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| LLM hallucination on financial facts | High | Deterministic engine computes all numbers; AI only narrates verified metrics; structured JSON + Zod validation; "not enough data" fallback. |
| Semi-structured PDF statements vary wildly | High | Parser abstraction; MVP supports explicit/common structures; graceful "cannot parse reliably, try CSV/XLSX or map manually"; never pretend universal PDF parsing. |
| Large imports block UI | Medium | Background/async processing, chunked parsing, progress updates, skeleton states. |
| Duplicate imports contaminate records | High | Deterministic fingerprint matching (date+amount+description+reference+account), keep/skip/review flow. |
| Data isolation breach | Critical | RLS + server-side scoping; tests enforce cross-user isolation; no client-trusted IDs. |
| Currency/money float errors | High | `numeric` decimal types; integer lowest-unit storage where needed; deterministic engine tested. |
| Category drift / wrong auto-categorization | Medium | Confidence thresholds + review queue + rules learning from corrections. |
| AI provider outage | Medium | Abstraction + offline rule fallback for categorization so import still works. |
| Dependency/compat drift | Medium | Pin stable versions; minimal deps; lockfile. |
| Security gaps (upload, injection) | High | Server-side validation, allowlists, size limits, parameterized queries, RLS. |

---

## 22. Definition of Done

A phase/feature is **done** when:
1. Implemented per blueprint with clean architecture and no fake functionality.
2. Passes lint + typecheck.
3. Relevant unit/integration tests pass (finance engine always covered).
4. Authz/isolation verified for the feature.
5. Has empty, loading, error, and responsive/mobile states.
6. Accessible (semantic, focus, labels, contrast).
7. Uses verified real data (deterministic engine) — no hardcoded numbers.
8. AI outputs validated and never used for arithmetic.
9. Documented (README/phase notes) with environment config.
10. The app remains runnable and demonstrable from the previous phase.

---

## 23. Demo Data (fictional)

- **Business:** Zooto Fashion Store (Retail, Nigeria, NGN).
- **Accounts:** GTBank Current, Moniepoint Business, Opay Wallet.
- **Transactions across ~3–6 months:** customer payments (revenue), supplier payments, Instagram/Meta ads, transportation (logistics), rent, utilities (MTN data/airtime), software subscriptions, banking charges, equipment, owner drawings (transfer).
- Deliberately includes a few low-confidence categories and a near-duplicate to showcase review + dedupe.
- Spring-seeded via `prisma/seed` into demo mode only; production data untouched; explicit reset.

---

## 24. Resolved Decisions (owner-confirmed)

| Decision | Choice |
|---|---|
| Database / Backend | **Supabase** (Postgres + Auth + Storage, RLS) |
| AI layer | **Deterministic rules engine** behind provider-agnostic interface; real LLM swappable later via env var (no key needed for demo) |
| Demo data | **Code-based seed** (`prisma/seed`) in isolated demo mode with reset command |

---

## 25. Approved Clarifications (owner)

1. Financial calculations are **strictly deterministic application logic**. AI never calculates or invents figures.
2. **Supabase RLS is the primary user-data security boundary.** The Prisma/data-access strategy must not unintentionally bypass RLS for user-facing operations. The authentication→database authorization flow will be documented explicitly.
3. **CSV and XLSX import are full MVP support.** PDF importing is explicitly scoped to **supported/common statement structures**, not universal PDF parsing.
4. The AI layer works **without an API key** using deterministic rules/fallbacks while keeping the provider abstraction for future LLM integration.
5. **No features outside the defined MVP** without asking first.
6. All existing UX, accessibility, responsive, error/loading/empty-state, testing, and security requirements are preserved.

**Status: APPROVED — Phase 1 (project foundation) in progress.**

---

*End of blueprint.*
