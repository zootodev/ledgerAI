# LedgerAI — Operations Runbook

Concise, production-facing operational guidance. This document does **not**
change product behavior; it records how to run, watch, and recover the app in
production. Product/architecture detail lives in `BLUEPRINT.md`, `HANDOFF.md`,
and `SUPABASE_RLS.md`.

---

## 1. Error monitoring & log sink

The app emits **namespaced, structured `console.error` / `console.warn`**
lines (no secrets, no raw PII) and never swallows a critical failure silently:

| Prefix | Emitted from | Meaning |
| --- | --- | --- |
| `[auth]` | `src/lib/services/auth.ts`, `src/lib/auth/actions.ts` | sign-up / reset / session-revoke failures |
| `[transactions]`, `[type-page]` | `src/app/transactions/page.tsx`, `src/components/transactions/type-page.tsx` | list / account / category loads failed |
| `[reports]` | `src/app/reports/error.tsx` | reports error boundary caught a render failure (digest only) |
| `[import]` / rule-learning logs | `src/lib/services/imports.ts`, `src/lib/services/rules.ts` | import commit / learning batch failures |
| `[rate-limit]` | `src/lib/security/rate-limit.ts` | rate-limit store unavailable (fails open) |
| `[db]` | `src/lib/db/client.ts` | Postgres pool/connection recycle (warn) |
| `[ask-trace]`, `[ask-v2-trace]` | `src/lib/observability/*` | deterministic Ask execution traces (Ask is hidden — see §5) |

**Recommendation:** forward the runtime's stdout/stderr to a managed log
sink (e.g. the hosting platform's log drain, Better Stack/Logtail, or
Axiom) and attach an error tracker (e.g. Sentry) to the server runtime.
Because every line already carries a `[scope]` prefix, route/severity
filtering needs no code change. Alert (page) on: any `[reports]` boundary
catch, a sustained spike in `[auth]` or `[transactions]` errors, and any
`[db]` pool error.

Do **not** log request bodies, tokens, or transaction payloads — the current
code deliberately logs only messages/digests/ids.

---

## 2. Postgres backups & restore drills

- **Engine:** Supabase-managed Postgres (accessed via the pooled connection
  in `src/lib/db/client.ts`).
- **No built-in backups:** the project runs on the Supabase **Free plan**,
  which provides **no automated backups and no Point-in-Time Recovery**. Never
  assume either exists. (Should the project move to a paid plan, enable both
  and keep them *alongside* the workflow below.)
- **Backup of record:** `.github/workflows/db-backup.yml` takes a weekly,
  **age-encrypted** `pg_dump` of the `public` and `auth` schemas and uploads
  only the ciphertext as a 90-day Actions artifact. This repository is public
  and artifacts are downloadable by any signed-in GitHub user, so the private
  key is kept **offline** — losing it means losing every backup. Setup,
  verification and restore steps: `docs/BACKUPS.md`.
- **What it does not cover:** point-in-time granularity (each dump is a weekly
  snapshot), Supabase Storage objects, and platform configuration. Operate on
  the assumption that a failure can lose **up to one week** of writes.
- **Ownership (assign explicitly):** one named **database owner** is
  accountable for: confirming each weekly run succeeded (GitHub disables
  scheduled workflows after 60 days without repository activity), keeping the
  age private key safe and backed up, and owning the restore procedure. A
  second **on-call engineer** must be able to perform a restore without the
  database owner.
- **Restore drills:** perform a **quarterly restore drill** into a **new**
  Supabase project or branch — never over production — verify row counts + a
  spot-checked report render, and record the drill date, duration, and
  outcome. A backup that has never been restored is not a verified backup.
- **RPO/RTO:** the weekly cadence is the effective RPO (up to seven days of
  write loss); document the target RTO (time to full recovery) alongside the
  drill result.

---

## 3. Failure monitoring

- **Import failures:** every import run is persisted as an `Import` row with
  `status` ∈ `started | parsing | reviewed | committed | failed` and an
  `errors` JSON payload (`src/lib/services/imports.ts`, `prisma/schema.prisma`).
  Alert on any run left non-`committed` beyond a generous timeout, and monitor
  the rate of `failed` runs. Invalid source rows are reported per-row to the
  user, not treated as system failures.
- **Export failures:** the CSV route (`src/app/reports/export/route.ts`)
  returns `400` for malformed/foreign scope, `429` when rate-limited
  (`[rate-limit]`), and redirects to `/login` when unauthenticated. Alert on
  `5xx` and on a sustained rise in `429`s (possible abuse or an over-tight
  limit).
- **Authentication failures:** `[auth]` lines cover reset/session-revoke
  errors. Track the sign-in → `/auth/callback` failure rate and any spike in
  `AuthorizationError` redirects to `/login`.

---

## 4. Browser import-draft retention

Import convenience caches are **best-effort and non-authoritative**; the
commit path re-parses, re-validates, and re-categorizes from the original
bytes server-side, so a stale or forged cache can never change what is
written (`src/lib/import/draft.ts`).

- **Draft TTL:** an unfinished review draft expires after **24 hours**
  (`IMPORT_DRAFT_TTL_MS`). An expired, future-skewed, or malformed draft is
  treated as absent so the wizard resumes cleanly.
- **Hint TTL:** the account/mapping memory hints expire after **30 days**
  (`IMPORT_MEMO_TTL_MS`).
- **Purge on sign-out and business switch:** `purgeImportCaches()` removes
  every `ledgerai:import-*` key on sign-out; `claimImportOwner()` purges and
  re-claims the caches when a different business opens the wizard on the same
  browser (a shared browser never surfaces one tenant's draft to another).
- **Storage split:** drafts live in `sessionStorage` (per-tab, cleared on
  close); only the tiny account/mapping hints use `localStorage`.
- **What is stored:** row indexes, column names, mapping hints, and
  **category ids**. `localStorage` **excludes raw transaction rows, monetary
  amounts, and sensitive credentials**. Category ids **are** server
  identifiers (validated server-side on commit) — they are retained only as
  limited UX metadata and are never treated as authoritative.

---

## 5. Ask surfaces are intentionally hidden

`/ask` and `/ask-v2` are **not part of the shipped product**. Both routes
redirect every authenticated visit to `/overview` (and signed-out visits to
`/login` through the ordinary proxy gate), and the **Ask navigation item is
not rendered**.

The Ask engine, services, database tables, tests, and the
`ASK_ENABLED` / `ASK_V2_ENABLED` server gates stay intact for a possible
future resumption. **Flipping those flags alone does NOT re-enable the
product:** the page entry points redirect unconditionally, and restoring
access requires deliberately reintroducing the roadmap-visible surface (nav
item + page implementation) in a dedicated, reviewed change.

This posture is enforced by tests rather than convention. The launch guard in
`tests/release/ask-launch-guard.test.tsx` asserts the surfaces are not
navigable, are served `noindex, nofollow`, and that both gates default OFF and
accept only explicit truthy values. It sits alongside the focused suites
(`tests/constants/navigation.test.ts`, `tests/ask/page.test.tsx`,
`tests/ask-v2/page.test.tsx`, `tests/release/release-smoke.test.tsx`) and the
disabled-action and tenant-isolation suites.

**To resume Ask** (v1 or v2), a single reviewed change must:

1. restore the page implementation that actually renders the surface
   (today both routes only redirect);
2. re-add the navigation entry so the surface is discoverable;
3. set the matching `ASK_ENABLED` / `ASK_V2_ENABLED` to `true` in the
   environment (they stay `"false"` in `.env.example`);
4. re-confirm the invariants that guard the surface: RLS remains enabled on
   `assistant_conversations` / `assistant_messages`, conversations remain
   tenant-scoped, and the narration seam still only ever re-words server-derived
   verified facts.
