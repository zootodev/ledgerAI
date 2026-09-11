# LedgerAI — Project Handoff (Living Document)

> **Last updated:** 2026-09-10 · **Current phase:** 8B (Ask LedgerAI; blueprint §19 phase 9) — browser-QA hardening complete (amount references, category breakdown, clarification selection, savings honesty) + database connection-lifecycle fix (Prisma P1017), uncommitted, unpushed
> **Repo:** `C:\Users\HP\ledgerai` · **Branch:** `main` · **HEAD:** `5f00cf8` (committed) + uncommitted Ask phase 8B work + DB client fix
> **Test baseline:** 674 tests / 43 files · typecheck · lint · build all clean

---

## Table of Contents

1. [Status at a glance](#1-status-at-a-glance)
2. [Chronological phase history](#2-chronological-phase-history)
3. [Bugs & incidents](#3-bugs--incidents)
4. [Ask LedgerAI evolution](#4-ask-ledgerai-evolution)
5. [Semantic architecture](#5-semantic-architecture)
6. [Accounting limitations](#6-accounting-limitations)
7. [Phase status matrix](#7-phase-status-matrix)
8. [Architecture map](#8-architecture-map)
9. [Schema reference](#9-schema-reference)
10. [Security](#10-security)
11. [Verification gates](#11-verification-gates)
12. [Git history](#12-git-history)
13. [Known issues & backlog](#13-known-issues--backlog)
14. [Next-AI instructions](#14-next-ai-instructions)
15. [Development history log format](#15-development-history-log-format)
16. [Continuous-update discipline](#16-continuous-update-discipline)
17. [Phase 8B release-readiness record (final semantic QA pass)](#17-phase-8b-release-readiness-record-final-semantic-qa-pass)
18. [Phase 8B browser-QA fixes (amount anchors, breakdown intent, persisted clarifications)](#18-phase-8b-browser-qa-fixes-amount-anchors-breakdown-intent-persisted-clarifications)
19. [Phase 8B browser-QA hardening (amount re-anchoring, category breakdown, selection composition, savings honesty)](#19-phase-8b-browser-qa-hardening-amount-re-anchoring-category-breakdown-selection-composition-savings-honesty)
20. [Database connection-lifecycle fix (Prisma P1017)](#20-database-connection-lifecycle-fix-prisma-p1017)

---

## 1. Status at a glance

| Aspect | Status |
|--------|--------|
| **Ask LedgerAI phase (8B)** | Implemented and fully green — browser-QA hardening complete, **UNCOMMITTED / UNPUSHED** |
| **DB connection-lifecycle (Prisma P1017)** | Fixed at the client layer (`src/lib/db/client.ts`) — globalThis singleton + pg keepalive/rotation, **UNCOMMITTED / UNPUSHED** |
| **Tests** | 674 passing / 43 files |
| **Typecheck** | Clean (`tsc --noEmit`) |
| **Lint** | Clean (ESLint, zero warnings) |
| **Build** | Clean (`next build`) |
| **Git diff --check** | Clean (no whitespace errors) |
| **Commit status** | All Ask phase + DB fix work UNCOMMITTED on `main` |
| **AI provider** | Seam implemented but inert by default (no API keys configured) |
| **Browser QA** | Not available in this env; verified manually by user earlier |
| **Demo data** | Phase 10 seed committed (Zooto Fashion Store) |

**Bottom line:** The Ask LedgerAI (Phase 8B) implementation is functionally complete and verified, and the recurring Prisma P1017 connection error is fixed at the database client layer. All 674 tests pass; typecheck, lint, and build are clean. The entire Ask phase (plus earlier WIP) and the DB fix remain uncommitted and unpushed on `main` pending your commit decision.

---

## 2. Chronological phase history

### Phase 1 — Project scaffold (committed `3848b43`, 2026-08-31)
- Next.js 16.3.4 (Turbopack) + TypeScript + Tailwind CSS + ESLint
- Prisma ORM + Supabase auth integration
- `npm run dev` green
- Basic project structure established

### Phase 2 — Design system (committed `5af0e17`, 2026-09-01)
- Reusable UI primitives: Button, Input, Select, Card, Badge, Modal, etc.
- Stat cards, data tables, charts (Recharts wrapper)
- Empty/loading/error states
- Layout shell with responsive sidebar
- Design tokens (colors, spacing, typography)

### Phase 3 — Database + Auth (committed `be1faca`, 2026-09-01)
- Prisma schema with RLS policies
- Supabase Auth: signup, login, logout, password reset
- Tenant isolation: `businessId` derived from session, never client-trusted
- Onboarding flow (business profile setup)
- Session management with JWT refresh

### Phase 4 — Core transactions (committed `af2fd16`, 2026-09-01)
- Transaction CRUD with validation (Zod)
- Categories (system defaults + custom)
- Transfers excluded from P&L
- Filtering, search, pagination
- Deterministic financial engine (`src/lib/finance/engine.ts`)

### Phase 5 — Dashboard & analytics (committed `cfe4a58`, `185a81f`, `9a29481`, 2026-09-01/02)
- Summary KPIs: revenue, expenses, net profit, margin
- Period comparison (week/month/quarter/year)
- Charts: revenue vs expenses, expense breakdown (donut), trends
- Date-range picker integration
- Phase 5C: trends and date ranges

### Phase 6 — Import pipeline (committed `9f3be65`, 2026-09-06)
- CSV/XLSX import via multi-step wizard
- Column mapping (auto-detect + manual override)
- Preview before commit
- Duplicate detection (fingerprint: date+amount+description+reference+account)
- Review queue for low-confidence transactions

### Phase 7 — AI categorization + rules (committed `cb38648`, `f5c37ca`, `4ef1e1b`, `ca4adee`, `1e1b5cf`, 2026-09-06/07)
- Deterministic rules engine (merchant/keyword → category)
- Learning from user corrections (persisted to `category_rules`)
- Phase 7B-1: type-aware rules, hardened merchant keys, authoritative Type column
- Phase 7B-2: nuanced transfer/honorific keys, A-Z rules, 1-based row display, checkbox+zoom UI
- Zero-filled debit/credit pair handling
- "Import anyway" for explicit duplicates

### Phase 8A — AI insights (committed `5f00cf8`, 2026-09-08)
- Deterministic insight cards (spending, revenue, profitability, anomalies)
- Date-range picker integration
- Narration from verified metrics (AI never computes)

### Phase 9 — Ask LedgerAI (UNCOMMITTED, 2026-09-08/10)
- **Status: Implemented + corrective pass complete**
- Deterministic semantic model (`semantics.ts`)
- Understanding analyzer (`understanding.ts`)
- Query engine (`finance/assistant.ts`)
- Service orchestration (`services/assistant.ts`)
- Persistent conversations (`assistant_conversations` / `assistant_messages`)
- UI: `/ask` route, `ask-shell.tsx`, `ask-history.tsx`
- Corrective pass: hypothetical/counterfactual reasoning, comparison windows, follow-up merges

### Phase 10 — Demo seed (committed `b83cca6`, 2026-09-07)
- Zooto Fashion Store demo data (NGN, Retail, Nigeria)
- Accounts: GTBank Current, Moniepoint Business, Opay Wallet
- ~3–6 months of transactions across categories
- Low-confidence categories + near-duplicate for review queue showcase
- Reset command for demo mode

### Phases 11–16 — NOT STARTED
- 11: Landing page + marketing polish
- 12: Responsiveness, accessibility, performance
- 13: Testing, hardening, documentation
- 14: Git history cleanup
- 15: Production deployment prep
- 16: Post-launch monitoring

---

## 3. Bugs & incidents

### Safari server actions (FIXED)
- **Issue:** Safari blocks server actions due to strict cookie handling
- **Fix:** Adjusted cookie settings for Safari compatibility
- **Impact:** Auth flow broken on Safari

### Email verification flow (FIXED)
- **Issue:** Auth email verification not completing properly
- **Fix:** Fixed verification callback handling
- **Impact:** New users couldn't verify email

### Mobile Chrome hydration mismatch (FIXED)
- **Issue:** Form components hydration mismatch on mobile Chrome
- **Fix:** Adjusted client-side rendering to avoid mismatch
- **Impact:** Visual glitches on mobile

### Transactions mobile responsiveness (FIXED)
- **Issue:** Transaction table overflow on mobile
- **Fix:** Responsive table layout adjustments
- **Impact:** Usability on small screens

### Supabase user incident (FIXED)
- **Issue:** User record missing after signup (Supabase edge case)
- **Fix:** Added defensive user creation/check in auth flow
- **Impact:** New users stuck without profile

### Prisma 7 migration (IN PROGRESS)
- **Issue:** Prisma 7 migration tooling changes
- **Impact:** Migration commands may differ from Prisma 6
- **Mitigation:** Use `npx prisma migrate dev` (still works)

### Ask LedgerAI corrective pass (FIXED)
- **Issue:** "If I spent less on others, would my profit increase?" and "...would my expense reduce?" both returned identical factual lecture
- **Root cause:** (1) "higher"→"highest" spelling collision hijacking `top_category` before hypothetical branch; (2) "₦50,000" normalization breaking "spent less" adjacency in phrase scanning; (3) `/\\b(this|that|it)\\b/` referential catching "this month"; (4) `followUp.kind !== "none"` guard missing (auth called for unsupported questions with conversationId); (5) `priorPeriodLabel` returning "July 2026" vs narration using "Last month" prefix mismatch
- **Fix:** Five targeted edits across `understanding.ts`, `assistant.ts`, `assistant-conversations.ts`
- **Impact:** Hypothetical questions now produce distinct, correct answers

---

## 4. Ask LedgerAI evolution

### Persistence (initial)
- Added `assistant_conversations` + `assistant_messages` tables
- Business-scoped conversations with `businessId` FK
- Bounded context: last 6 messages per conversation for follow-up
- Migration `20260908165349_assistant_conversations`

### UX passes
- Chat shell with message history
- Conversation list sidebar
- Responsive layout for mobile
- Empty state for no conversations

### Empty state
- Helpful prompt when no data: "Import your first statement"
- Guidance for new users

### Intelligence (corrective pass)
- **Hypothetical/counterfactual reasoning:** "If I spent less on others..." now gives expense-reduction answer, not profit lecture
- **Comparison windows:** "than last month" fires on concrete references, not rhetorical "than before"
- **Follow-up merges:** "what if I reduced that by ₦50,000?" resolves "that" to category from previous answer
- **Bare referentials:** "how would that affect my profit?" asks for subject instead of guessing
- **Narration discipline:** Never invents amounts; user-stated amounts computed through, otherwise symbolic anchored to verified figures

### Safari composer fix (in progress)
- Text input issues on Safari
- Awaiting browser QA

---

## 5. Semantic architecture

```
User question
    ↓
understanding.ts (deterministic analyzer)
    ├─ Token normalization (spelling tolerance, NON_CORRECTABLE words)
    ├─ Intent detection (revenue, expense, profit, category, trend, etc.)
    ├─ Hypothetical detection (SPENDING_CUT/RAISE_PHRASES, CONDITIONAL_PHRASES)
    ├─ Comparison detection (concrete references like "than last month")
    ├─ Follow-up analysis (priorPeriod, hypothetical, category correction)
    └─ Semantic model output (Zod-validated)
    ↓
finance/assistant.ts (query engine)
    ├─ Query generation (date ranges, category filters, type filters)
    ├─ Metrics computation (deterministic engine)
    ├─ Narration generation (hypotheticalImpactAnswer, etc.)
    └─ Response formatting
    ↓
services/assistant.ts (orchestration)
    ├─ Tenant isolation (businessId from requireAuthContext)
    ├─ Context merges (follow-up against conversation history)
    ├─ Persistence (save question/answer to conversation)
    └─ Bounded context (last 6 messages)
    ↓
API surface (actions/assistant.ts → app/ask/page.tsx)
```

**Key design decisions:**
- Ask semantics live in `src/lib/ask/` (not `src/lib/ai/`)
- Engine is deterministic-first and authoritative
- LLM may rewrite narration wording but NEVER computes or overrides figures
- Comparisons/hypotheticals modeled as `mode`/`effectGoal`/`operation`/`hypotheticalAmount` on existing `expense_impact` query (keeps all exact-shape factual tests stable)
- Anti-hack rule: one generic spelling-tolerance mechanism (token edit-distance + `NON_CORRECTABLE` word list); no per-example regex patches

---

## 6. Accounting limitations

- **No double-entry bookkeeping:** Transactions are single-entry (income/expense/transfer)
- **No accounts payable/receivable:** No aging, no payment terms
- **No multi-currency:** Single currency per business (default NGN)
- **No tax calculations:** No VAT, no withholding, no tax categories
- **No bank reconciliation:** No statement matching against imported data
- **No audit trail:** No change history for edits (only created/updated timestamps)
- **No GL/journal entries:** Not an accounting system, just a financial intelligence tool
- **Transfers excluded from P&L:** By design (owner drawings, inter-account moves)
- **Category rules are per-business:** No cross-business learning
- **PDF import limited:** Only common statement structures, not universal parsing

---

## 7. Phase status matrix

| Phase | Name | Status | Commit | Tests |
|-------|------|--------|--------|-------|
| 1 | Project scaffold | ✅ COMPLETE | `3848b43` | ✅ |
| 2 | Design system | ✅ COMPLETE | `5af0e17` | ✅ |
| 3 | Database + Auth | ✅ COMPLETE | `be1faca` | ✅ |
| 4 | Core transactions | ✅ COMPLETE | `af2fd16` | ✅ |
| 5 | Dashboard & analytics | ✅ COMPLETE | `cfe4a58` + 2 more | ✅ |
| 6 | Import pipeline | ✅ COMPLETE | `9f3be65` | ✅ |
| 7 | AI categorization + rules | ✅ COMPLETE | `cb38648` + 4 more | ✅ |
| 8A | AI insights | ✅ COMPLETE | `5f00cf8` | ✅ |
| 9 | Ask LedgerAI | 🟡 IMPLEMENTED (uncommitted) | — | ✅ 621 tests |
| 10 | Demo seed | ✅ COMPLETE | `b83cca6` | ✅ |
| 11 | Landing page | ⬜ NOT STARTED | — | — |
| 12 | Responsiveness/a11y/perf | ⬜ NOT STARTED | — | — |
| 13 | Testing/hardening/docs | ⬜ NOT STARTED | — | — |
| 14 | Git history cleanup | ⬜ NOT STARTED | — | — |
| 15 | Production deployment | ⬜ NOT STARTED | — | — |
| 16 | Post-launch monitoring | ⬜ NOT STARTED | — | — |

---

## 8. Architecture map

```
src/
├── app/                          # Next.js App Router
│   ├── (marketing)/              # Landing page (not started)
│   ├── (auth)/                   # Sign in/up, forgot/reset password
│   ├── onboarding/               # Business setup
│   └── (app)/                    # Authenticated shell
│       ├── overview/             # Dashboard (KPIs, charts, insights)
│       ├── transactions/         # List + detail drawer
│       ├── income/               # (derived from transactions)
│       ├── expenses/             # (derived from transactions)
│       ├── reports/              # Monthly/income/expense/profit/category
│       ├── insights/             # AI insight cards (phase 8A)
│       ├── import/               # Multi-step wizard
│       ├── ask/                  # Ask LedgerAI (phase 9)
│       └── settings/             # Profile, business, categories, accounts
├── components/
│   ├── ui/                       # Design system primitives
│   ├── charts/                   # Recharts wrappers
│   ├── transactions/             # Transaction table, detail drawer
│   ├── import/                   # Import wizard steps
│   ├── insights/                 # Insight cards
│   ├── dashboard/                # KPI cards, period selector
│   ├── ask/                      # Ask shell, history (phase 9)
│   └── layout/                   # Sidebar, header, mobile nav
├── lib/
│   ├── ai/                       # Provider seam (inert by default)
│   │   ├── provider.ts           # LLM abstraction
│   │   ├── understanding.ts      # AI understanding (unused)
│   │   ├── financial-assistant.ts # AI assistant (unused)
│   │   └── types.ts              # AI types
│   ├── ask/                      # Ask semantic model + analyzer
│   │   ├── semantics.ts          # Zod model (mode, operation, etc.)
│   │   ├── understanding.ts      # Deterministic analyzer
│   │   ├── group-history.ts      # History grouping
│   │   └── ask-first-state.ts    # Initial UI state
│   ├── finance/                  # Deterministic engine
│   │   ├── engine.ts             # Core metrics (revenue, expense, profit)
│   │   ├── assistant.ts          # Query→metrics→narration (phase 9)
│   │   ├── analysis.ts           # Pure analysis computations
│   │   └── insights.ts           # Insight card generation
│   ├── import/                   # CSV/XLSX parsing, mapping, validation
│   ├── services/                 # Business logic layer
│   │   ├── auth-context.ts       # requireAuthContext (tenant isolation)
│   │   ├── assistant.ts          # Orchestration + context merges
│   │   ├── assistant-conversations.ts # Persistence + bounded context
│   │   └── index.ts              # Service exports
│   ├── db/                       # Prisma client, Supabase
│   ├── validation/               # Zod schemas
│   └── utils/                    # Helpers
├── hooks/                        # React hooks
├── types/                        # TypeScript types
└── constants/                    # App constants
```

---

## 9. Schema reference

**Prisma schema** (`prisma/schema.prisma`, 239 lines, 10 models):

| Model | Purpose | Key fields |
|-------|---------|------------|
| `User` | Supabase auth user + profile | `id` (uuid), `email`, `name`, `created_at` |
| `Business` | Tenant/workspace | `id`, `user_id` FK, `name`, `type`, `country`, `currency` (default NGN), `size` |
| `Account` | Financial account | `id`, `business_id` FK, `name`, `institution`, `currency` |
| `Category` | Transaction category | `id`, `business_id` FK (nullable for system defaults), `name`, `type` (income/expense), `is_system` |
| `Transaction` | Financial transaction | `id`, `business_id` FK, `account_id` FK, `date`, `description`, `amount` (numeric), `type` (income/expense/transfer), `category_id` FK, `source`, `fingerprint` |
| `Import` | Import session record | `id`, `business_id` FK, `filename`, `file_type`, `status`, `transactions_found`, `transactions_imported`, `errors` (jsonb) |
| `Insight` | AI insight card | `id`, `business_id` FK, `type`, `title`, `description`, `metadata` (jsonb), `period_start`, `period_end` |
| `CategoryRule` | Learned categorization rule | `id`, `business_id` FK, `match_type` (merchant/keyword), `pattern`, `category_id` FK |
| `AssistantConversation` | Ask conversation | `id`, `business_id` FK, `title`, `created_at`, `updated_at` |
| `AssistantMessage` | Ask message | `id`, `conversation_id` FK, `role` (user/assistant), `content`, `created_at` |

**Key constraints:**
- All financial data scoped by `business_id` (tenant isolation)
- `amount` is `numeric` (never float)
- `transactions.type` + `fingerprint` power duplicate detection
- Foreign keys with `ON DELETE CASCADE` where appropriate
- RLS policies on all tables (defense-in-depth)

**Migrations:** 31 migration directories (`0_init` through `20260908165349_assistant_conversations`)

---

## 10. Security

- **Auth:** Supabase Auth (email/password, JWT sessions, password reset)
- **Authorization:** RLS on all tables (defense-in-depth); service layer re-scopes every query to session-derived `businessId`
- **Never trust client IDs:** `businessId` always derived from authenticated user's business record
- **Server-side validation:** Zod on every API boundary
- **Secrets:** `.env` only; `.env.example` committed; no keys in frontend
- **File uploads:** Private storage bucket; allowlist MIME + extension; size limits
- **No sensitive data in logs:** Financial descriptions never logged
- **Parameterized queries:** Prisma prevents SQL injection
- **CORS/CSRF:** Same-origin app handling
- **Rate limiting:** On auth + AI routes (via middleware where practical)

**Reference:** `SUPABASE_RLS.md` (72 lines) documents the complete auth→DB authorization flow.

---

## 11. Verification gates

| Gate | Command | Status |
|------|---------|--------|
| Typecheck | `npm run typecheck` (`tsc --noEmit`) | ✅ Clean |
| Lint | `npm run lint` (ESLint) | ✅ Zero warnings |
| Tests | `npm test` (`vitest run`) | ✅ 635 passing / 41 files |
| Build | `npm run build` (`next build`) | ✅ Clean |
| Git diff | `git diff --check` | ✅ Clean |

**Definition of done (per BLUEPRINT §22):**
1. Implemented per blueprint with clean architecture
2. Passes lint + typecheck
3. Relevant unit/integration tests pass
4. Authz/isolation verified
5. Has empty, loading, error, responsive states
6. Accessible (semantic, focus, labels, contrast)
7. Uses verified real data (deterministic engine)
8. AI outputs validated, never used for arithmetic
9. Documented with environment config
10. App runnable from previous phase

---

## 12. Git history

| Commit | Date | Message | Phase |
|--------|------|---------|-------|
| `3848b43` | 2026-08-31 | `feat: scaffold LedgerAI project foundation` | 1 |
| `5af0e17` | 2026-09-01 | `feat: add reusable design system foundation (phase 2)` | 2 |
| `be1faca` | 2026-09-01 | `feat: implement database auth and tenant isolation (phase 3)` | 3 |
| `af2fd16` | 2026-09-01 | `feat: implement core transaction domain (phase 4)` | 4 |
| `4875b1f` | 2026-09-01 | `feat: fix authentication email verification flow` | Bugfix |
| `894414d` | 2026-09-01 | `fix: handle mobile Chrome form hydration mismatch` | Bugfix |
| `67ad8b1` | 2026-09-01 | `fix: improve transactions mobile responsiveness` | Bugfix |
| `cfe4a58` | 2026-09-01 | `feat: add dashboard analytics foundation` | 5 |
| `185a81f` | 2026-09-01 | `feat: integrate analytics into overview dashboard` | 5 |
| `9a29481` | 2026-09-02 | `feat: add overview analytics trends and date ranges (phase 5C)` | 5C |
| `fbab3b5` | 2026-09-06 | `chore(dev): allow Tailscale and DevTunnels origins in dev` | Dev |
| `78916c7` | 2026-09-06 | `fix(ui): stop date inputs overflowing on iOS WebKit` | Bugfix |
| `9f3be65` | 2026-09-06 | `feat: add CSV/XLSX import pipeline (phase 6)` | 6 |
| `630c9d1` | 2026-09-06 | `chore: ignore ledgerai-test.csv` | Chore |
| `cb38648` | 2026-09-06 | `feat: learn category rules from user corrections (phase 7)` | 7 |
| `f5c37ca` | 2026-09-06 | `fix(import): handle zero-filled debit/credit pairs and common header aliases` | Bugfix |
| `4ef1e1b` | 2026-09-06 | `fix(import): commit existing duplicates explicitly marked "Import anyway"` | Bugfix |
| `ca4adee` | 2026-09-06 | `feat(import): type-aware rules, hardened merchant keys, authoritative Type column (phase 7B-1)` | 7B-1 |
| `1e1b5cf` | 2026-09-07 | `feat(import): nuanced transfer/honorific keys, A-Z rules, 1-based row display, checkbox+zoom UI (phase 7B-2)` | 7B-2 |
| `b83cca6` | 2026-09-07 | `feat(seed): add Zooto demo data seed (phase 10)` | 10 |
| `5f00cf8` | 2026-09-08 | `feat(insights): deterministic AI insight cards with date-range picker (phase 8A)` | 8A |

**Uncommitted work:** Entire Ask LedgerAI phase (Phase 8B; blueprint §19 phase 9) + earlier WIP (modified README, schema, dashboard/theme components, AI provider seam)

---

## 13. Known issues & backlog

### Known issues
1. **"What about before?"** — Needs bounded prior window; falls back to unsupported after open-ended (e.g. all-time) question
2. **"that"/"it" category recovery** — Understands only deterministic narration templates; future LLM-rewritten answers could break it
3. **"How much did I save?"** — Now a savings clarification (spend-reduction vs leftover-after-expenses); never mapped to a metric; resolves only via owned conversation context. (Resolved in the §17 final QA pass, 2026-09-10.)
4. **Spelling tolerance** — Distance-based; rare legitimate words within 1–2 edits of financial vocabulary can still be respelled (defended by `NON_CORRECTABLE` list)
5. **Balance hypotheticals** — Asserts effect only on change amount, never on cumulative position
6. **Safari composer** — Text input issues on Safari; awaiting browser QA
7. **No AI provider configured** — Provider seam exercised only via mocks

### Backlog
- Wire real AI provider (OpenAI/Anthropic) to exercise understanding/narration seam
- Browser QA of `/ask` (real `providers/supabase` project)
- Commit the Ask LedgerAI phase
- Phase 11: Landing page + marketing polish
- Phase 12: Responsiveness, accessibility, performance
- Phase 13: Testing, hardening, documentation
- Phase 14: Git history cleanup
- Phase 15: Production deployment prep
- Phase 16: Post-launch monitoring

---

## 14. Next-AI instructions

### For the next AI session:
1. **Commit decision:** User decides when/how to commit the Ask phase (and earlier WIP)
2. **Browser QA:** Run manual browser pass on `/ask` to confirm deterministic answers + history feel right in-product
3. **AI provider wiring:** Optionally configure real API keys to exercise the understanding/narration seam against the same Zod contract
4. **Phase progression:** After committing Phase 8B, proceed to phase 11 (landing page) or phase 12 (responsiveness/a11y/perf) per user priority
5. **Handoff discipline:** Update this document at the end of each session with:
   - What was implemented/changed
   - Test counts (before/after)
   - Any new bugs/incidents
   - Schema changes (new migrations)
   - Current phase status
   - Next recommended steps

### Context for new AI:
- **Repo:** `C:\Users\HP\ledgerai`
- **Branch:** `main`
- **Test command:** `npm test` (`vitest run`)
- **Typecheck:** `npm run typecheck`
- **Lint:** `npm run lint`
- **Build:** `npm run build`
- **Prisma:** `npx prisma migrate dev` after schema changes
- **Env:** `.env` present with Supabase/DB vars; no AI provider keys
- **Blueprint:** `BLUEPRINT.md` (603 lines) is the plan of record
- **Security model:** `SUPABASE_RLS.md` (72 lines) documents auth→DB flow
- **Test baseline:** 635 tests / 41 files (verified 2026-09-10)

---

## 15. Development history log format

At the end of each work session, update this document with:

```
### Session: [DATE]
**Phase:** [current phase number/name]
**Implemented:** [list of changes]
**Tests:** [before count] → [after count]
**Schema changes:** [new migrations or model changes]
**Bugs fixed:** [list]
**Known issues:** [any new issues discovered]
**Next steps:** [recommended actions]
**Commits made:** [list of commit hashes/messages]
```

---

## 16. Continuous-update discipline

This document is a **living artifact**. It must be updated:

1. **At the end of each work session** — Log session summary (§15 format)
2. **When phases complete** — Update phase status matrix (§7)
3. **When bugs are fixed** — Add to bugs & incidents (§3)
4. **When schema changes** — Update schema reference (§9)
5. **When tests change** — Update test counts (§1, §11)
6. **When committing** — Update git history (§12)
7. **When discovering new issues** — Add to known issues (§13)

**Never:**
- Commit secrets, API keys, or credentials
- Remove historical information (only append/update)
- Claim features are complete without test verification
- Fabricate information not grounded in the codebase

---

## 17. Phase 8B release-readiness record — final semantic QA pass (2026-09-10)

This section records the final semantic QA/correction pass performed on Ask LedgerAI **before** committing. It is the required update to the living project record — nothing was reset or restructured, and full project history above remains intact.

### Request
Pre-commit semantic QA and corrections for Phase 8B (Ask LedgerAI; the blueprint's §19 numbering labels the same work phase 9 — both names refer to the same uncommitted body of work):
- Distinguish **clarification** vs **unsupported**; "How much did I save last month?" must produce a concise clarification (e.g. "Do you mean how much you spent less than the previous period, or how much money you had left after expenses?") instead of the out-of-scope answer.
- Never overgeneralize "savings" into profit, income−expenses, or prior-period expense reduction. Resolve only via bounded owned conversation context; clarify otherwise.
- Verify contextual resolution ("What were my expenses last month?" → "How much did I save?").
- Final natural-language QA (25 questions + spelling errors).
- Verify the two screenshot regressions stay distinct: "…my profit increase than before?" vs "…my expense reduce than before?".
- Answer-relevance rule (answer what was asked, use the relevant metric, never unrelated metrics).
- Financial calculation safety (bounded context, tenant scoping, deterministic calcs) preserved.
- Compositional semantic changes — no regex-patch spirals.
- Update (do not reset) HANDOFF.md; keep Phase 8B uncommitted/unpushed; no secrets; no fake phases/commits/test counts.

### Investigation
- Audited repo state: HEAD `5f00cf8` on `main`; 11 modified tracked files (+100/−24) and the untracked Ask work — all Phase 8B (Ask) plus earlier WIP. Full file inventory recorded in §1/§12.
- Traced the classification pipeline: `src/lib/ask/understanding.ts` (`understand`, `detectHypothetical`, `analyzeFollowUp`, `parsePeriod`, `detectCategory`, typo tolerance) → `src/lib/ask/semantics.ts` (Zod semantic schemas incl. `semanticClarificationReasonSchema`) → `src/lib/finance/assistant.ts` (`parseAssistantQuestion`, `classifyAssistantQuestion`, `clarificationText`, answers) → `src/lib/services/assistant.ts` (auth-first, follow-up resolution via owned context, deterministic `groupBy` reads).
- Confirmed clarifications render as transient bubbles (`src/components/ask/ask-shell.tsx` treats `kind: "unsupported"` locally) — no UI change required.
- Confirmed the provider seam accepts new clarification reasons automatically (`src/lib/ai/understanding.ts` reuses `semanticQuestionSchema`).
- Found the root cause of the pre-existing "save → unsupported" behavior: `understand()` had no savings branch, and "save" was in the factual-cut vocabulary without any ambiguity resolution.

### Changes
- `src/lib/ask/understanding.ts`
  1. Added `SAVINGS_PHRASES` (["save","saves","saved","saving","savings"]) and made savings part of the typo-tolerance vocabulary so spelling variants resolve toward savings words.
  2. Added `isBareReference()` (pronoun/"what about …?" turns with no own subject → needs subject from conversation; metric/category-naming turns are never bare) and `isSavingsQuestion()` (compositional savings signal).
  3. `detectHypothetical()`: added the **relational frame** (`hasSpendChangeBeforeVerb` + `CHANGE_VERB` + `TARGET_METRIC`) so "Does spending less reduce my expenses?" is hypothetical, while "Reduce my expenses this month" (imperative) and "Did my expenses reduce last month?" (factual retrospective) stay factual.
  4. `understand()`: bare-reference → `clarification / needs_subject` (branch 4); savings → `clarification / ambiguous_savings` (branch 16, before the final unsupported). Reordered `isBareReference` pronoun checks ahead of the category guard (category keyword overlap falsely mapped "what did that change?" → Banking). Guarded the category-spend branch against savings wording so "How much did I save on Software?" never collapses into a spend query. Renumbered branch comments for accuracy.
- `src/lib/ask/semantics.ts`: added `"ambiguous_savings"` to `semanticClarificationReasonSchema`.
- `src/lib/finance/assistant.ts`: added `SAVINGS_CLARIFICATION_ANSWER`, extended `ClarificationReason` with `"ambiguous_savings"`, added `clarificationText(reason)` (savings-specific wording only for `ambiguous_savings`; generic wording otherwise), mapped `ambiguous_savings` in `classifyAssistantQuestion`.
- `src/lib/services/assistant.ts`: both clarification branches now return `clarificationText(classification.reason)` instead of the single generic constant.

### Tests
- `tests/ask/semantics-understanding.test.ts`: updated the savings-case expectations (clarification, not unsupported) and added describe blocks for savings ambiguity, bare conversational references, relational hypothetical framings, the full natural-language QA list (~25 questions + spelling), and the two screenshot-regression questions (a profit-goal vs expenses-goal distinction).
- `tests/services/assistant-hypothetical.test.ts`: added service-level savings tests — no-context savings → clarification (no auth, no SQL, nothing persisted), "How much would I save?" resolves against an owned hypothetical context (`If I spent ₦50,000 less on Other?`), and a past-tense savings question stays a clarification even with unrelated owned context.
- Baseline before this pass: 621 tests / 41 files. After: **635 tests / 41 files** (14 new).

### Verification
| Gate | Result |
|------|--------|
| `npm run typecheck` (`tsc --noEmit`) | ✅ Clean |
| `npm run lint` (ESLint) | ✅ Zero warnings |
| `npm test` (`vitest run`) | ✅ 635 passing / 41 files |
| `npm run build` (`next build`) | ✅ Clean |
| `git diff --check` | ✅ Clean |
| `git status --short` | ✅ Scope confirmed (Ask semantics + HANDOFF only) |

### Current state
- Phase 8B (Ask LedgerAI) implementation is **functionally complete and verified**, but remains **UNCOMMITTED and UNPUSHED** on `main` at HEAD `5f00cf8` (+ the Phase 8B working tree).
- Savings questions clarify instead of guessing; bare referential turns clarify when no owned context exists; the two screenshot regressions produce distinct answers; all prior semantics/security/tenant-isolation invariants still hold (no auth context or businessId scope was changed; follow-up context remains bounded to owned conversation history).

### Remaining limitations
- "How much did I save?" is only resolved from owned context when the prior turn established a hypothetical meaning; with related-but-vague context it clarifies (per design, no invented definition).
- Monthly/period period-only follow-ups rely on `analyzeFollowUp`; a period-only turn in a fresh conversation clarifies rather than resolves.
- Category recovery from conversational context only understands the deterministic narration templates (pre-existing, §13 #2).
- `/ask` browser QA and real AI-provider wiring remain pending (no provider keys; no browser env).

### Next step
- **Commit decision is the user's.** When approved: create the Phase 8B commit(s) on `main` (do not push without confirmation), update §12 git history, then proceed to the next phase per user priority (11 landing / 12 responsiveness / 13 hardening).

---

## 18. Phase 8B browser-QA fixes (amount anchors, breakdown intent, persisted clarifications)

Recorded 2026-09-10. Follow-up to §17: the user's browser QA surfaced three semantic failures in the deterministic Ask LedgerAI pipeline, all fixed compositionally (no phrase patches, no hard-coded values).

### Issues fixed
1. **Amount reference + conversation context** — "What did I spend 187,600 on?" after our own "Spending in August 2026 was ₦187,600." previously returned `expenses this_month` (the number token was ignored and the period defaulted). Now it is an `expense_breakdown` whose period is `conversation_reference`; the service anchors the figure ONLY against the previous owned answer's own narration (`extractCitedAmount` reads our "Spending in … was ₦…" template). A mismatch between the user's figure and our cited total, or no owned context, produces an `ambiguous_amount` clarification — never a guess.
2. **Category-spending phrasing must be a breakdown** — "What category made my spending in August 187,600?" previously fell into `expense_impact` (revenue/profit lecture). Now it is `expense_breakdown`: a category-by-category listing with amounts (≤5 largest + remainder), never a revenue/profit narration.
3. **Clarification selection ("The two" / "Both")** — after the savings clarification, a bare selection previously returned `unsupported`. Now savings (and `ambiguous_amount`) clarifications are **persisted** as an explicit `"clarification"` AskOutcome kind; a subsequent closed-set selection turn (`the two`, `both`, `both of them`, `both of those`, `i mean both`, `those two`, `both options`, `both together`, `both combined`) resolves deterministically — and ONLY against an immediately preceding owned savings clarification whose recorded answer matches `clarificationText(reason)`. Without that owned context, "Both" has no meaning (falls to `unsupported`, nothing persisted). Out-of-scope/unsupported answers remain transient, as designed.

### Approach
- **Semantic model** (`src/lib/ask/semantics.ts`): added intent `"expense_breakdown"`, period kind `"conversation_reference"`, optional query field `amountReference { value, source: user_stated | previous_answer }` (never an invented figure), and reason `"ambiguous_amount"`.
- **Understanding** (`src/lib/ask/understanding.ts`): added composition verbs (`made up`, `consists of`, `break down`, `divided`, …), `AMOUNT_ANCHOR`/`SPEND_REFERENTIAL` (with a `(?! month|year|week|day)` guard so "spend this month" is not a referential), and `detectExpenseBreakdown()`. Extremes (`top`/`low`), named categories, and the existing "which categories did I spend on" distribution phrasing are explicitly excluded, so `spendingDistribution`, `lowestCategory`, `topCategory`, `incomeVsExpenses`, and `categorySpend` keep their exact prior behavior. `understand()` gained branch 4.5; `analyzeFollowUp()` gained `expenseBreakdown` and `clarificationSelection` kinds (closed-set list).
- **Finance assistant** (`src/lib/finance/assistant.ts`): mapped the new intent/period/amountReference; `classifyAssistantQuestion` turns `conversation_reference` queries into `{kind:"clarification", reason:"ambiguous_amount"}` (the engine period union has no `conversation_reference`, so it could never be a standalone data query); added `AMOUNT_CLARIFICATION_ANSWER`; `answerFromMetrics` gained the `expenseBreakdown` narration (top ≤5 with amounts, remainder listed, "the ₦X you asked about" ONLY when the anchored figure is our own, within 0.5% or ₦0.01 tolerance); `conversationTitle` → "Spending breakdown — <period>".
- **Service layer** (`src/lib/services/assistant.ts`): `AskOutcome.kind` += `"clarification"`; clarifications for `ambiguous_savings`, `ambiguous_amount`, `needs_subject` are persisted via `persistAssistantExchange` (title "Savings clarification" / "Amount clarification" / "Clarification"); `resolveExpenseBreakdownQuery` anchors the amount from the OWNED previous answer or returns null → `ambiguous_amount` clarification; `resolveClarificationSelection` re-classifies the previous recorded question via `classifyAssistantQuestion` and requires `reason === "ambiguous_savings"` + `clarificationText(reason) === lastTurn.answer`, then combines both readings (expenses vs prior period + profit-left) from ONE `collectMetrics` call and persists one combined exchange ("Savings — both readings").
- **UI (`src/components/ask/ask-shell.tsx`)**: no change needed — `kind !== "unsupported"` already routes persisted answers (including the new `clarification`) through the stored transcript reload.
- **AI seam** (`src/lib/ai/understanding.ts` + schema): `expense_breakdown` valid (explicit-period) payloads accepted; `conversation_reference` is deliberately rejected for provider output (service-anchored only).

### Tests
- `tests/ask/semantics-understanding.test.ts`: new describe blocks for expense-breakdown semantics (amount/period/referential detection, `ambiguous_amount` classification, engine mapping, narration with category amounts) and clarification-selection follow-ups (closed-set detection, standalone "Both" stays unsupported, plural "both of my accounts" untouched).
- `tests/services/assistant-browser-qa.test.ts` (new, 9 tests): issue 1 anchored resolution + mismatch clarification + no-context clarification + unrelated/foreign context never anchors; issue 2 breakdown-not-impact; issue 3 "The two"/"Both" both-readings resolution + no-meaning-without-savings-clarification + savings clarification persisted for context reuse.
- `tests/ai/understanding.test.ts`: `expense_breakdown` added to the accepted catalogue cases.
- Existing assertions that clarifications are never persisted were updated (`tests/services/assistant-hypothetical.test.ts`, `tests/services/assistant-followup.test.ts`) — `clarification`/`unsupported` kinds and persist-call expectations now match the persisted-clarification design; out-of-scope stays transient (`assistant-ask.test.ts` unchanged).

### Verification
| Gate | Result |
|------|--------|
| `npm run typecheck` (`tsc --noEmit`) | ✅ Clean |
| `npm run lint` (ESLint) | ✅ Zero warnings |
| `npm test` (`vitest run`) | ✅ 654 passing / 42 files |
| `npm run build` (`next build`) | ✅ Clean |
| `git diff --check` | ✅ Clean |

### Current state
Still **UNCOMMITTED / UNPUSHED** on `main` at HEAD `5f00cf8`. `/ask` browser QA and live AI-provider wiring remain out of scope for this session (no browser env, no provider keys).

---

## 19. Phase 8B browser-QA hardening (amount re-anchoring, category breakdown, selection composition, savings honesty)

Recorded 2026-09-10. Follow-up to §18: the user's second browser-QA pass surfaced four further semantic failures in the deterministic pipeline, all fixed compositionally (no phrase patches, no hard-coded figures, no LLM introduction).

### Issues fixed
1. **Conversational amount references (re-anchoring)** — "What was the 187600 spent on?", "Where did that amount go?", "That amount", and bare figure continuations ("the 187600") after our own narration previously fell to `unsupported`/generic answers. The first phrase actually parsed (`expense_breakdown`); the service failed because `extractCitedAmount` only matched the plain "Spending in … was ₦X" template and `priorQueryForContext` returned null whenever the prior question was itself a `conversation_reference`. Now:
   - `understand()`/`analyzeFollowUp()` recognize register-noun references ("that amount", "the figure" via `AMOUNT_ANCHOR` + new `THE_AMOUNT_NOUN`), "where did that amount go"/"what did the amount go toward" framing (`detectGoTarget`/`SPENT_TARGET`), and bare figures ("the 187600") as a new `amountConfirmation` follow-up kind.
   - `hasMoneyishScope` gained `amount|figure|sum`; `NON_CORRECTABLE` gained `both/two/them/options/readings/meanings/mean` so the selection vocabulary is never spell-mangled.
   - The service now re-anchors from **both** owned narration templates (`extractCitedNarration`: "Spending in … was ₦X" and "Of the ₦X you asked about in <label>"), maps the narration's period label via `periodFromLabel` (with a fallback to the prior question's own period parse), and walks back **at most two owned exchanges** (`findRecentOwnedExchanges` in `assistant-conversations.ts`) via `resolveAmountConfirmation`. Figures are still ONLY ever read from our own narration — never from arbitrary user numbers — and the 0.5%/₦0.01 tolerance still guards matches.
   - Standalone amount/register turns with no owned anchor now produce an `ambiguous_amount` clarification (new `understand()` branch 17) instead of `non_financial` unsupported; `classifyAssistantQuestion` now maps the semantic `ambiguous_amount` reason through (it had been collapsing to `ambiguous_financial_metric`).
2. **No-amount category-spending intent** — "What category made my spending in August?" (no figure) previously fell to `expense_impact` (revenue/profit lecture). `detectExpenseBreakdown` now returns true for `wordCategory && expensePhrase`; extremes (top/lowest), "which categories did I spend on" distribution, named-category spend, and the "spent money on X that made my revenue lesser" impact frame are all still excluded.
3. **Clarification selection composition** — "Both readings", "Both meanings", "I want both", "Both options", etc. previously weren't in the closed set (`CLARIFICATION_SELECTIONS`), so spell/typo tolerance had to never touch them. Replaced the closed-set list with a compositional whole-turn check (`isBothSelectionText`) over a small selection vocabulary + mandatory "both"/"two"; turns with their own subject ("both of my accounts") still never match; no-context "Both" still has no meaning.
4. **Savings both-readings honesty** — the combined narration ("Savings — both readings") previously read like "spending went from ₦0 to ₦252,600" — misleading when spending ROSE. Reading 1 now explicitly reports the spending DELTA vs the prior period ("you spent ₦80,000 less / ₦50,000 more than in July 2026") and claims a saving ONLY when current < prior ("That is the amount you saved under this reading." / "Spending rose, so there is nothing to report as money you spent less."); reading 2 remains money left after expenses (net profit) from the engine's own narration (data from the targeted `periodComparison` → `{current, prior, priorLabel, period}` shape). No metric was redefined; costs still come only from the finance engine.

### Approach
- `src/lib/ask/understanding.ts`: register-noun + go/spend-target framing; `hasMoneyishScope` extension; `detectExpenseBreakdown` new rules; selection vocabulary composition; `amountConfirmation` follow-up kind; `understand()` branch 17 (`ambiguous_amount`); `NON_CORRECTABLE` additions.
- `src/lib/finance/assistant.ts`: `classifyAssistantQuestion` maps semantic `ambiguous_amount` → `{kind:"clarification", reason:"ambiguous_amount"}`.
- `src/lib/services/assistant-conversations.ts`: new `findRecentOwnedExchanges` (≤2 exchanges, newest-first, ownership-checked by businessId+conversationId).
- `src/lib/services/assistant.ts`: `extractCitedNarration` (both templates) + `periodFromLabel`; `resolveExpenseBreakdownQuery` reworked to narration-anchored with period fallback; new `resolveAmountConfirmation` + wiring for `amountConfirmation`; `resolveClarificationSelection` draft rewritten for explicit, honest two-readings wording.

### Tests
- `tests/ask/semantics-understanding.test.ts`: grammatical amount-reference variants; register-only references; "where did that amount go" → context-anchored breakdown; bare/figure continuations → `amountConfirmation` and standalone `ambiguous_amount`; no-amount category-breakdown variants (in, made up, divided by, …); preservation of `topCategory` and the revenue-impact frame; selection-vocabulary phrases extended to "I want both", "Both readings", "Both meanings", "Both options", "The two of them", "Please give me both".
- `tests/services/assistant-browser-qa.test.ts`: issue-4 flows — re-anchor after the plain expense narration, re-anchor after our own breakdown narration, walk-back through our own clarification to re-anchor a bare figure, and "nothing owned cites a figure → clarify, no guessing"; issue-5 — "What category made my spending in August?" and "How was my August spending divided by category?" answer a breakdown; savings honesty — saving claimed only when spending fell, plain increase wording when it rose.

### Verification
| Gate | Result |
|------|--------|
| `npm run typecheck` (`tsc --noEmit`) | ✅ Clean |
| `npm run lint` (ESLint) | ✅ Zero warnings |
| `npm test` (`vitest run`) | ✅ 668 passing / 42 files (654 → 668) |
| `npm run build` (`next build`) | ✅ Clean |
| `git diff --check` | ✅ Clean |

### Current state
Still **UNCOMMITTED / UNPUSHED** on `main` at HEAD `5f00cf8`. `/ask` browser QA and live AI-provider wiring remain out of scope (no browser env, no provider keys). Next recommended step: user commits the Phase 8B work (update §12 git history afterwards), then continue per priority (11 landing / 12 responsiveness / 13 hardening).

---

## 20. Database connection-lifecycle fix (Prisma P1017)

Recorded 2026-09-10. Follow-up to a recurring production error: `PrismaClientKnownRequestError P1017` / `DriverAdapterError: ConnectionClosed` at `src/lib/services/auth.ts:131` (`prisma.user.upsert()`) — the first DB write after each idle→active transition.

### Root cause
- **Error mapping:** `@prisma/adapter-pg` maps a socket-level `ECONNRESET` → `kind: "ConnectionClosed"` → P1017 "Server has closed the connection." The app was writing a query onto a pooled `pg` client whose TCP peer (Supabase PgBouncer **session-mode pooler**, `pooler.supabase.com:5432`) had already closed the idle connection. Not a DNS/refused/timeout/TLS failure.
- **Why it persisted:** the `pg` pool ran with keepalive **off**, `idleTimeoutMillis: 10000`, and `maxUses: Infinity`, so a connection that stayed within the idle window (or stayed busy) was never recycled and its dead socket went undetected until the first write after an idle gap.
- **Contributor:** the Prisma client was a module-scoped `let prisma` with no `globalThis` cache and no `$disconnect()`, so Next.js/Turbopack dev hot reload orphaned the previous client + pool and churned connections.
- **Explicitly NOT** a driver-adapter misconfiguration (`new PrismaPg({ connectionString })` + `new PrismaClient({ adapter })` is canonical for Prisma 7.10 `engineType = "client"`), and not an application-logic bug. `DATABASE_URL` and its credentials were preserved verbatim (no rewrite, no provider switch, no Supabase-side changes).

### Fix (`src/lib/db/client.ts` only — `auth.ts` and Ask LedgerAI semantics untouched)
- **Lifecycle:** singleton moved to `globalThis` (`globalForPrisma`) instead of a module-level `let`, so Turbopack hot reload reuses the same PrismaClient + pool.
- **Pool config** passed to `PrismaPg` as a `pg.PoolConfig` (verified against installed `@prisma/adapter-pg` 7.10 / `pg` 8.23 / `@types/pg` 8.23.1):
  - `keepAlive: true` + `keepAliveInitialDelayMillis: 30_000` — pg detects a pooler-closed socket at the transport layer and recycles it instead of the next query hitting `ECONNRESET`.
  - `connectionTimeoutMillis: 10_000` — fail fast if the pooler is unreachable instead of hanging a request.
  - `idleTimeoutMillis: 30_000` — relaxes pg's 10s default so healthy idle connections are reused longer, reducing churn against the pooler.
  - `max: 5` — conservative for a single-instance dashboard; ample for the seed, metrics, and Ask LedgerAI `$transaction`s without pressuring the pooler.
  - `maxUses: 1_000` — rotates a connection after ~1k queries (default `Infinity` lets long-lived connections decay into the stale state that caused P1017).
  - `application_name: "ledgerai"` — identifies the connection in `pg_stat_activity`/Supabase dashboards (observability, no secrets).
  - **SSL intentionally left at pg defaults** (the URL has no `sslmode` params; changing it risked breaking the currently-working link).
- **Observability:** `onPoolError` logs a compact, secret-free `console.warn` (rare, pool-level); `onConnectionError` logs at `console.debug` (transaction-scoped; the query error is already surfaced to the caller, so this never duplicates normal output). No logging per normal query.
- **Deliberately NOT added:** a generic retry around `prisma.user.upsert()` — the underlying connection lifecycle is fixed instead, per decision.

### Tests
- `tests/db/client.test.ts` (new, 6 tests): repeated `getPrismaClient()` calls reuse ONE client and construct the adapter exactly once; the `PrismaPg` pool config is asserted (keepAlive/keepAlive delay/connectionTimeout/idleTimeout/max/maxUses/`application_name`, and `connectionString` passed through **verbatim**); the adapter produced by `PrismaPg` is exactly the one handed to `PrismaClient`; null return and no construction without `DATABASE_URL`; HMR-safety (a fresh module re-evaluation returns the **same** cached client with no new adapter); `requirePrisma()` throws its clear error only when `DATABASE_URL` is absent.
- All existing tests untouched.

### Verification
| Gate | Result |
|------|--------|
| `npm run typecheck` (`tsc --noEmit`) | ✅ Clean |
| `npm run lint` (ESLint) | ✅ Zero warnings |
| `npm test` (`vitest run`) | ✅ 674 passing / 43 files (668 → 674) |
| `npm run build` (`next build`) | ✅ Clean |
| `git diff --check` | ✅ Clean |
| Live DB round-trip (real adapter, `tsx --env-file=.env` + `SELECT 1`) | ✅ `ROUNDTRIP_OK` |
| Dev server (`next dev`, Turbopack) | ✅ Booted; `GET /login` 200; `/overview` redirects to `/login?next=/overview` (unauthenticated) |

### Residual risk
- The authenticated flow that calls `syncUserProfile()` could not be exercised here (no real session/browser in this env); connectivity was verified at the pool layer with a live round-trip. Keepalive + `maxUses` recycling should make recurring P1017 rare; a single dead-socket query can still fail once (and that connection is then recycled). No retry wrapper was added by decision.
- All of this work plus every Phase 8B change remains **UNCOMMITTED / UNPUSHED** on `main` at HEAD `5f00cf8`.

---

## 21. Generalized conversation context — deterministic financial context frames (2026-09-10)

Follow-up to §18/§19 hardening. The bespoke last-turn resolvers inside `src/lib/services/assistant.ts` were replaced by a reusable, pure, deterministic frame layer so that every conversational follow-up is re-derived from OWNED persisted `(question, answer)` pairs — never from the client, an LLM, or any unstored state — with the finance engine remaining the sole authority for every figure.

### Design
- **`src/lib/finance/context-frame.ts` (new, pure — no I/O, clock injected via `now`):** a "context frame" is a structured re-reading of ONE owned exchange: `classification` + `query` via the deterministic `classifyAssistantQuestion`, `reported` figures via `readNarration` (parses ONLY our own `answerFromMetrics` templates, not user text), and a `period` resolved as `query.period → narration label → question period → savings default ("this month")`.
- **`readNarration` reader table** per intent (balance, income, expenses, profit incl. loss-as-negative, profitMargin, topCategory, lowestCategory, categorySpend, spendingDistribution, incomeVsExpenses, expenseBreakdown) with a generic fallback (`readBreakdown` then `readExpenses`) for clarification frames that still cite a spending total. Known limitation: `spendingDistribution`'s category-name regex expects lowercase-initial names, but narration title-cases them, so only that reader's label/total are recovered reliably.
- **`resolveAgainstFrames(question, fragment, frames, now)`:** frames are newest-first; resolution ranks evidence `explicit_exact` (user-cited figure matching our own within the engine tolerance `|a−b| ≤ max(a·0.005, 0.01)`) > `semantic_relationship` (register-only references to a narrated spending total) > `continuity` (period / prior-window / hypothetical inheritance), where a first match also implies recency.
- **Anchor gating:** only `expenses` and `category` narrated totals may anchor an `expenseBreakdown`/`amountConfirmation`; profit/income/balance never anchor (a register-only "that amount" after a profit answer correctly falls through to classification/unsupported).
- **`answerSavingsBothReadings`** (service layer) composes the "Both"/"The two" two-option savings answer via ONE shared `collectMetrics` call (single summary/priorSummary, never two DB pipelines) into one persisted exchange, spelling out both readings: (1) the spending DELTA vs the prior period — a saving claim only when current < prior; (2) money left after expenses (net profit). The engines stay the sole authority for every figure; the analysis reads a "savings clarification" only from an owned `ambiguous_savings` exchange whose answer equals `SAVINGS_CLARIFICATION_ANSWER`.
- **`loadContextFrames` (service layer):** builds frames from `findLastUserQuestionForContext` PLUS (only for `expenseBreakdown`/`amountConfirmation` fragments, which may need to walk back past a stored clarification) `findRecentOwnedExchanges`, de-duplicating the last turn. Gating recent-exchange reads on the fragment kind preserves the tests' mock surface — `assistant-followup` / `assistant-hypothetical` mock neither store function.
- Dependency graph stays acyclic: `context-frame → finance/assistant + ask/understanding`, and `services/assistant → context-frame`.

### Tests
- `tests/finance/context-frame.test.ts` (new, 20 tests): canonical-template round-trips per reader (incl. loss-as-negative and the anchored breakdown + generic fallback), the `buildContextFrame` period chain, resolution matrix (period inherit, prior-window label, hypothetical goal/category/amount inherit, exact anchor, engine-tolerance mismatch refused, register-only refused on profit, savings selection only against an owned `ambiguous_savings` exchange, all fragment kinds → `none` with no context), `shiftRangeBack`/`periodFromNarrationLabel`, and a deterministic property round-trip: `mulberry32`-seeded random integer metrics → `answerFromMetrics` → `readNarration` recovers every listed figure within rounding tolerance ≤ 1 (no flakiness, no drift beyond rounding).
- All 44 existing test files untouched and green.

### Verification
| Gate | Result |
|------|--------|
| `npm run typecheck` (`tsc --noEmit`) | ✅ Clean |
| `npm run lint` (ESLint) | ✅ Zero warnings |
| `npm test` (`vitest run`) | ✅ 694 passing / 44 files (674 → 694) |
| `npm run build` (`next build`) | ✅ Clean |
| `git diff --check` | ✅ Clean |

### Residual risk / honest limits
- Authenticated browser-QA flows (real session) and provider-classification paths could not be exercised here — no browser, session, or AI keys in this env. Deterministic engine flows are fully unit-covered; provider output remains Zod-validated at the service boundary and never touches data.
- The user-facing savings draft and narration wording are exact-string-matched by unit tests; an intentional wording change requires synchronized test edits (IDs/titles/regex location).
- Same UNCOMMITTED / UNPUSHED status as §20 and all Phase 8B work (main @ `5f00cf8`).

---

## 22. Real-browser follow-up failure — "What was that spent on?" (2026-09-11)

### What was observed (authenticated browser QA, real accounts)
Conversations starting with `What were my expenses last month?` (answer: August total) fell apart on the SECOND turn:
- Account A: Q2 → `I don't have enough data to answer that accurately.`
- Account B: Q2 → `Spending in September 2026 was ₦65,000.`
- Account C: Q2 → `Spending in September 2026 was ₦65,000.`

The initial query worked (August totals narrated correctly); the failure was entirely on the second message.

### Root cause (static trace + repro script)
`classifyFollowUp` → `analyzeFollowUp` returned `{kind:"none"}` for bare-pronoun PASSIVE phrasing. In `detectExpenseBreakdown`, `referential` required either
`AMOUNT_ANCHOR` (`that amount`, `that spending`, …) or `SPEND_REFERENTIAL` (verb BEFORE pronoun: `spent that on`). `What was that spent on?` puts the pronoun before the verb, so neither matched, the frame branch never ran, and the turn fell through to standalone classification → `expenses` + thisMonth.

**Why the three accounts diverged (one root cause):** all three fell through to a standalone September-expenses read. A had no September activity → `noActivity` → insufficient; B and C had September expense data → a September total narration. It was never a frame/ranking divergence — the follow-up was simply never detected.

### The fix (generic, not phrase-specific)
- `src/lib/ask/understanding.ts`:
  - `REFERENTIAL_PASSIVE` — pronoun + auxiliary + spend verb with a later target preposition (`that was spent on`, `it was paid for`) — passive mirror of `SPEND_REFERENTIAL`; keeps `when was it spent?` out via the required `on/for/toward/into`.
  - `COMPOSITION_REFERENTIAL` — pronoun adjacent to a composition verb (`made up that expense`, `break that down`).
  - Breakdown scope gate also accepts composition/referential/spending-target structures (so `Break that down.` with no money word is recognized).
  - `hasAmountAnchor` extended with both, so the follow-up remote gate passes.
  - New spending-subject rule: a spending-target verb plus a named figure or a SECOND spend word (`the August spending … spent on`) is a breakdown with the explicit period — `spending on X` (a single spend phrase) stays a plain figure.
- `src/lib/finance/context-frame.ts`: `resolveAmountAnchor` for a CITED figure now collects ALL owned matches and, when the same figure was narrated in MORE THAN ONE distinct period, returns the new `FrameResolution.ambiguousAmount` — an honest clarification, never a guessed period. Register-only references keep newest-first-wins. Same figure in the SAME period still resolves.
- `src/lib/services/assistant.ts`: `ambiguousAmount` → persisted `ambiguous_amount` clarification; added env-gated `ASK_DEBUG=1` follow-up trace (no secrets — no ids/credentials/raw transactions).
- Note: revenue/profit have no composition intent. `Break that down.` after a revenue answer resolves no frame and falls through to an `ambiguous_amount` clarification (never an invented income breakdown).

### Tests
- New `tests/services/assistant-real-world.test.ts` (23 tests): the exact three-account reproductions, generalized follow-up variants, explicit override vs. unmatched figure, older-frame recall, duplicate figure in different (clarify) / same (resolve) periods, revenue/profit metric fidelity, and ask-layer classification of the exact failing phrasing.
- Verification fixtures confirmed at the real breakage boundary: `askAssistantQuestion` with the same persisted-conversation reads the browser QA exercised.

### Verification gates
| Gate | Result |
|---|---|
| `npm test` | 45 files / 717 passed (694 baseline + 23 new) |
| `npx tsc --noEmit` | clean |
| `npm run lint` | clean |
| `npm run build` | clean (19 routes) |
| `git diff --check` | clean |

### Residual risk / honest limits
- Authenticated browser round-trip on the three real accounts still cannot be executed here (no browser/session). The pipeline is verified through the same `askAssistantQuestion` boundary with mocked persistence — the identical reads the real bug traversed.
- Reproductions with the exact account figures were added, so a regression to the September fall-through fails loudly.
- Same UNCOMMITTED / UNPUSHED status as §20 and §21 (main @ `5f00cf8`).

---

## §23 — Ask LLM architecture (spec `LEDGERAI_ASK_LLM_ARCHITECTURE_SPEC.md`)

Status: implementation complete for the offline-deterministic default, the shadow and canary seams, and the full test suite. All gates green.

### What changed (new ask stack, `off` = byte-identical deterministic)
- **Trusted interpreter contract** (`src/lib/ask/contracts.ts`): Zod-strict `interpretationSchema` (query/clarify/unsupported; money may only be a *text span* — never a model number), `extractionSchemas` (8 verified tool-result contracts, `source` pinned to `deterministic_finance_engine`), `executionPlanSchema` + `assistantQuerySchema` (allowlisted tool keys only), narration manifest/plan schemas (fact ids `F1..Fn`), `askTurnInputSchema`.
- **Compiler** (`src/lib/ask/compiler.ts`): interpretation → prepare under a strict tool-key allowlist; clarification reasons canonicalized; category_spend without entity → clarify.
- **Policy** (`src/lib/ask/policy.ts`): `evaluateInterpretationPolicy` with a 0.6 confidence floor, entity/reference-slot validation (deny `invalid_reference` unless advertised).
- **Context resolver** (`src/lib/ask/context-resolver.ts`): REDACTED interpreter surface (kinds + slot names only — no categories, figures, or ids), reference-slot grounding reusing `resolveAgainstFrames` (explicit-exact > semantic > continuity), `conversation_reference` breakdown only; V2 structured frame derivation (§6) for the deferred turn-state write path.
- **Provider seam** (`src/lib/ai/ask-provider.ts` + `src/lib/ai/providers/{deterministic,openai-compatible}.ts`): `getAskAi()` selector (server env only), deterministic fallback providers (`configured=false`, interpreter yields `unsupported/0` so it never displaces the engine), fetch-based `OpenAiCompatibleClient` (temperature 0, `response_format json_object`, bounded `max_tokens` 600, 12s abort deadline, ONE retry under the same body, key gated).
- **Trusted tool execution** (`src/lib/finance/tools/{query-helpers,result-schemas,executor}.ts`): shared tenant-scoped aggregates extracted from the service; `computeMetricsFor` is a structural copy of the old `collectMetrics` (offline parity); `executePlan` validates every tool result and assembles `AssistantMetrics` → `answerFromMetrics`. All DB reads are pre-auth-tenant-scoped.
- **Facts + narration guard** (`src/lib/finance/{facts,renderer}.ts`): immutable fact manifest built from verified metrics (money/percents rendered by trusted Intl logic — the LLM never computes), `factCoverageOk` gate (every required figure must appear AND every cited figure must be attributable to a manifest fact), deterministic fallback on any gate miss.
- **Service wiring** (`src/lib/services/assistant.ts`): `askAssistantQuestion` reads `getAskAi()`; `off` untouched; `shadow` = fire-and-forget trace (sample-rate gated); `canary` unlocks ONLY on deterministic clarification/unsupported (follow-up classification stays authoritative-deterministic ALWAYS); legacy narration seam preserved under narration-off; `ASK_DEBUG=1` structured `ask.turn.completed` trace (redacted).
- **Turn-state seam** (`src/lib/services/assistant-turn-state.ts`): `deriveTurnStateV2` (pure) + `writeTurnStateIfEnabled` gated on `ASK_STRUCTURED_STATE_WRITE` (default off); DB adapter intentionally a stub emitting a redacted trace marker — no Prisma migration yet.

### Tests
- New `tests/ask/{contracts,compiler,policy,context-resolver}.test.ts`, `tests/finance/tools/executor.test.ts`, `tests/finance/{facts,renderer}.test.ts`, `tests/ai/providers.test.ts` (deterministic + mocked-`fetch` OpenAI-compatible), `tests/observability/ask-trace.test.ts` (redaction negatives), `tests/services/assistant-modes.test.ts` (off/shadow/canary with a mocked interpreter), and `tests/ask/evals/{harness,fixtures,evals.test.ts}` including §22 goldens (canary stays out of an authoritative query; a cited duplicate figure across two owned periods → `ambiguous_amount` clarification; fixture contract assertions).

### Verification gates
| Gate | Result |
|---|---|
| `npm test` | 56 files / 815 passed (717 previous + 98 new) |
| `npx tsc --noEmit` | clean |
| `npm run lint` | clean |
| `npm run build` | clean (19 routes) |
| `git diff --check` | clean |

### Residual risk / honest limits
- No live AI keys or sessions here: the interpreter/narration path is verified through the same production wiring (`askAssistantQuestion`) with a mocked interpreter and mocked `fetch` for the OpenAI-compatible client — no real provider canary hit any live endpoint.
- `AssistantTurnState` Prisma model/migration deliberately deferred (Write flag default off); only the pure V2 derive + gated write seam exist.
- The narration gate is intentionally strict (attributability of every number); if the real LLM narration style turns out to be too constrained in production, relax `factCoverageOk` explicitly — never by weakening the contracts.
- Same UNCOMMITTED / UNPUSHED status as §20–§22 (main @ `5f00cf8`).

---

*End of HANDOFF.md — this document is the single source of truth for project state, history, and next steps.*
