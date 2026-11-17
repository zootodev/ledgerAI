# LedgerAI design audit

Date: 14 November 2026
Branch: `main` at `b8bcc1b2f79b67c6def746d28e15323797da2aed`
Scope: `/`, `/login`, `/signup`, `/onboarding`, `/overview`, `/transactions`, `/import`, `/income`, `/expenses`, `/reports`, `/insights`, `/settings`, empty states, errors and loading states.

## Evidence

Screenshots were captured from the running app at 1440 x 1000 desktop and iPhone 13 mobile, full page.

| Set | State | Path |
| --- | --- | --- |
| Public, before | Landing, sign in, sign up | `tmp/design-shots/before-public/{desktop,mobile}/` |
| App, before | Empty audit business | `tmp/design-shots/before-app/{desktop,mobile}/` |
| App, before | 36 seeded transactions, four accounts | `tmp/design-shots/before-data/{desktop,mobile}/` |

The empty-state and populated captures use a temporary Supabase user and seeded data. Those artefacts stay local and uncommitted.

## Measured baseline

| Signal | Count | Notes |
| --- | ---: | --- |
| Sparkle icons | 16 | 14 `Sparkles` references in `.tsx`, plus the import and navigation in `src/constants/navigation.ts` |
| Uppercase tracked eyebrows | 51 | `uppercase tracking-wide/wider/widest` in `.tsx` |
| Em dashes in `.tsx` | 151 | 148 lines, including prose, placeholder glyphs and comments |
| `animate-pulse` occurrences | 10 | Loading skeletons plus decorative inline placeholder blocks |
| Stock colour utilities | 5 | `bg-slate-900`, `bg-red-700`, `bg-white` variants |
| Hard-coded brand colours outside tokens | 4 | Metadata, viewport and manifest still use `#2563eb` or `#ffffff` |
| Non-token large radii | 7 | `rounded-xl` and `rounded-2xl` in auth, not-found and ask surfaces |
| `shadow-sm` on controls | 4 | Buttons and checkbox plus landing cards |
| Repeated icon-card grids | 8 | Landing features, hero KPIs, overview KPIs, import summary, insights, auth value strip, settings rows, empty states |

## Issue register

Severity: **H** blocks the redesign brief, **M** undermines the product character, **L** polish.

### Global foundations

| ID | Severity | Screen | File | Lines | Issue |
| --- | --- | --- | --- | --- | --- |
| G1 | H | All | `src/app/globals.css` | 10-60 | Default slate/blue palette. The blue brand, cool greys and white surfaces read as a stock SaaS theme rather than a money product. |
| G2 | H | All | `src/app/globals.css` | 91-104 | Large `0.75rem` cards, `0.5rem` fields and blue chart ramp. Radii are soft and consumer-like. |
| G3 | H | All | `src/app/globals.css` | 106-112 | Card shadows are always on. Data surfaces are floating cards instead of bordered ledger sheets. |
| G4 | H | All | `src/app/globals.css` | 84-87 | System UI font. No characterful self-hosted face and no guaranteed tabular numerals at the font level. |
| G5 | H | All | `src/app/layout.tsx` | 21-41 | Metadata and theme colour still use an em dash and `#2563eb`; no font class is applied. |
| G6 | H | All | `src/app/manifest.ts` | 6-17 | PWA colours describe `#2563eb` and `#ffffff`, duplicating the stock palette outside tokens. |
| G7 | M | All | `src/app/globals.css` | 217-223 | Reduced-motion handling exists, but pulse animation is still used decoratively outside loading surfaces. |
| G8 | M | All | `src/components/ui/button.tsx` | 25-33 | Primary and danger buttons use `shadow-sm`; danger hover hard-codes `bg-red-700`. Controls should be flat with borders. |
| G9 | M | All | `src/components/ui/card.tsx` | 10-19 | `Card` always applies `shadow-card`; interactive cards add a second shadow. This is the source of the floating-card look across screens. |
| G10 | M | All | `src/components/ui/data-table.tsx` | 247-259 | Table headers are uppercase tracked labels and the table has no sticky header or bounded scroll area. |
| G11 | M | All | `src/components/ui/empty-state.tsx` | 20-35 | Empty states allow an icon medallion, a title, a paragraph and multiple actions. The brief calls for one clear line and one button. |
| G12 | M | All | `src/components/ui/error-state.tsx` | 20-34 | Generic "Something went wrong" copy and a large circular triangle medallion. Errors do not say what happened in product terms. |
| G13 | M | All | `src/components/ui/stat-card.tsx` | 31-146 | The default KPI unit is an icon card with optional trend chip. Repeated across overview and import, producing the card grid the brief rejects. |
| G14 | H | All | 51 `.tsx` files | see `rg "uppercase tracking"` | 51 uppercase tracked labels. Target is at most two. |
| G15 | H | All | 127 `.tsx` files | 148 lines with `—` | 151 em dashes. Most are in visible prose, including metadata, empty states, hints and import explanations. |

### Landing page and wordmark

| ID | Severity | Screen | File | Lines | Issue |
| --- | --- | --- | --- | --- | --- |
| L1 | H | `/` | `src/app/page.tsx` | 40-49 | Wordmark is the letter L in a rounded blue box at `43`. The brief forbids this exact construction. |
| L2 | H | `/` | `src/app/page.tsx` | 51-94 | `FeatureCard` is the repeated icon-tile unit. It is reused six times with different icons. |
| L3 | H | `/` | `src/app/page.tsx` | 101-174 | Hero preview uses round mock figures (`₦1,240,000`, `₦612,400`, `₦627,600`, `+12%`) and a smooth decorative area chart. |
| L4 | H | `/` | `src/app/page.tsx` | 176-241 | `MonthlyTrendChart` uses tidy six-month bars with round `₦120k/₦60k/₦0` gridlines. It is an illustration, not a product screenshot. |
| L5 | H | `/` | `src/app/page.tsx` | 286-288 | Hero starts with a generic uppercase tracked eyebrow: "Financial intelligence, not bookkeeping busywork". It is also a "not X" construction. |
| L6 | H | `/` | `src/app/page.tsx` | 292-300 | Headline and lead use broad AI/insight language instead of concrete Nigerian bookkeeping detail. |
| L7 | H | `/` | `src/app/page.tsx` | 328-338 | Pain section is a three-card grid of generic small-business claims. |
| L8 | H | `/` | `src/app/page.tsx` | 371-461 | Feature section is a second icon-card grid, including repeated three-item groups. |
| L9 | H | `/` | `src/app/page.tsx` | 401-435 | Includes the requested removal: "Ask your ledger" with "Coming soon" at `433-435`. |
| L10 | H | `/` | `src/app/page.tsx` | 415-435 | Two sparkle icons on the "Plain-language insights" and "AI is opt-in" tiles at `427` and `598`. |
| L11 | H | `/` | `src/app/page.tsx` | 492-526 | A whole "AI insights" section with an illustrative insight card and simulated figures. |
| L12 | H | `/` | `src/app/page.tsx` | 554-565 | "Built for owners, not accountants" plus a three-item checklist and a four-item trust strip, adding more repeated groups. |
| L13 | H | `/` | `src/app/page.tsx` | 587-637 | FAQ and long security/limitations prose push the page to nine or more sections. Target is about five. |
| L14 | M | `/` | `src/app/page.tsx` | 28-38 | CTA, eyebrow, heading and lead are utility strings with shadows and wide tracking. |
| L15 | H | `/` | `src/app/page.tsx` | 20-25 | Metadata uses "Financial Intelligence for Small Businesses" and a generic description. |
| L16 | M | `/` | `src/app/page.tsx` | 654 | CTA is "See your business clearly - starting today", a vague uplift line. |

### Authentication and onboarding

| ID | Severity | Screen | File | Lines | Issue |
| --- | --- | --- | --- | --- | --- |
| A1 | H | `/login`, `/signup` | `src/app/(auth)/layout.tsx` | 14-24 | Uses the same letter-in-rounded-box logo and a generic centered card with a shadow. |
| A2 | H | `/login`, `/signup` | `src/components/auth/auth-value-strip.tsx` | 10-45 | A repeated three-step "Import / Review / Profit" list. It is the exact triad the brief asks to break. |
| A3 | M | `/login` | `src/components/auth/login-form.tsx` | 60-105 | Form heading and copy are generic sign-in boilerplate. Errors restate the heading rather than naming the next action. |
| A4 | M | `/signup` | `src/components/auth/signup-form.tsx` | 85-173 | Heading and benefits repeat the auth strip. Terms copy is dense and sits in the same rhythm as the rest. |
| A5 | H | `/onboarding` | `src/app/onboarding/page.tsx` | 26-45 | The screen has no product identity beyond a letter box and is visually disconnected from the signed-in shell. |
| A6 | M | `/onboarding` | `src/components/onboarding/onboarding-form.tsx` | 75-91 | "Step 1 of 2" is another uppercase tracked eyebrow; the description uses an em dash at `83`. |
| A7 | M | `/onboarding` | `src/components/onboarding/onboarding-form.tsx` | 187 | Goals hint uses "e.g." and an em dash and reads like a generic setup form. |
| A8 | M | `/onboarding` | `src/components/onboarding/onboarding-form.tsx` | 226 | Completion copy promises "your dashboard will..." without naming the first import action. |

### App shell, navigation and system pages

| ID | Severity | Screen | File | Lines | Issue |
| --- | --- | --- | --- | --- | --- |
| S1 | H | All app screens | `src/components/layout/logo.tsx` | 10-16 | Letter-in-rounded-box logo in the shell. Same forbidden construction as the landing page. |
| S2 | H | All app screens | `src/components/layout/sidebar.tsx` | 47, 63 | "Soon" badge and section headings use uppercase tracked labels. Sidebar sections look like stock dashboard furniture. |
| S3 | M | All app screens | `src/components/layout/sidebar.tsx` | 29-44 | Active navigation is a soft brand pill. The shell has no ledger-like structure such as a rule, index or folio. |
| S4 | H | All app screens | `src/constants/navigation.ts` | 8, 28 | Imported sparkle icon and "AI Insights" label. Total sparkle count includes this reference and use. |
| S5 | M | All app screens | `src/components/layout/header.tsx` | 26-96 | Header repeats the page title in a generic top bar, separate from the page heading below. |
| S6 | M | Mobile | `src/components/layout/mobile-nav.tsx` | 34-97 | Uses `bg-slate-900/40` and `backdrop-blur-[2px]`, a stock modal treatment. |
| S7 | M | `/not-found` | `src/app/not-found.tsx` | 17-33 | Rounded `2xl` icon medallion, uppercase "404" eyebrow and vague "This page went missing" copy. |
| S8 | M | Errors | `src/app/error.tsx` | 26-52 | Error page relies on the generic `ErrorState`; copy does not tell the owner what failed or what to do next. |
| S9 | M | `/insights` loading | `src/app/insights/loading.tsx` | 7 | Loading title says "AI Insights", reinforcing the AI-first identity. |
| S10 | M | `/insights` metadata | `src/app/insights/page.tsx` | 14 | Page title "AI Insights" and generic product naming. |

### Overview

| ID | Severity | Screen | File | Lines | Issue |
| --- | --- | --- | --- | --- | --- |
| O1 | H | `/overview` | `src/components/dashboard/overview-shell.tsx` | 36-63 | Header stacks a business badge, a range control, then a second page title area. The first screen is chrome, not books. |
| O2 | H | `/overview` | `src/components/dashboard/kpi-grid.tsx` | 140-188 | Four icon KPI cards with arrows and trend chips. Round mock values and placeholder em dashes at `185-188`. |
| O3 | H | `/overview` | `src/components/dashboard/kpi-grid.tsx` | 159 | Empty state uses a long two-clause sentence with two em dashes and two possible next actions. |
| O4 | M | `/overview` | `src/components/dashboard/overview-actions.tsx` | 3, 68 | Sparkle icon in the actionable panel at `68`. |
| O5 | M | `/overview` | `src/components/dashboard/overview-actions.tsx` | 61, 87 | Low-confidence explanation and latest import line use em dashes. |
| O6 | M | `/overview` | `src/components/dashboard/overview-charts.tsx` | 20-156 | Two separate chart cards with identical card treatment. Charts are generic bars and lines, not a ledger readout. |
| O7 | M | `/overview` | `src/components/dashboard/analytics-range-control.tsx` | 91, 102 | Uppercase tracked "From" and "To" field labels. |
| O8 | M | `/overview` | `src/components/dashboard/business-wide-note.tsx` | 1-47 | A repeated informational card above data, separate from the ledger surface. |
| O9 | M | `/overview` | `src/components/dashboard/overview-shell.tsx` | 46-58 | Business badge and "All accounts" chip compete with the page title. |

### Transactions, income and expenses

| ID | Severity | Screen | File | Lines | Issue |
| --- | --- | --- | --- | --- | --- |
| T1 | H | `/transactions` | `src/components/transactions/transactions-view.tsx` | 563-670 | Page header, three summary blocks, a review banner, then filters. The actual ledger starts too far down. |
| T2 | H | `/transactions` | `src/components/transactions/transactions-view.tsx` | 677-766 | Every filter control has an uppercase tracked label. Nine occurrences on one screen. |
| T3 | M | `/transactions` | `src/components/transactions/transactions-view.tsx` | 367, 430, 481 | Missing values use em dashes inside table cells. |
| T4 | M | `/transactions` | `src/components/transactions/transactions-view.tsx` | 619-650 | Empty state and review queue explainer use em dashes and multi-sentence copy. |
| T5 | M | `/transactions` | `src/components/ui/data-table.tsx` | 270-310 | Rows use `py-3`, which is looser than a ledger. Amount columns are right aligned but the type and account columns compete for attention. |
| T6 | M | `/income`, `/expenses` | `src/components/transactions/transactions-view.tsx` | 540-562 | Locked-type screens reuse the same header and summary pattern, so income and expenses are visually identical apart from the type filter. |
| T7 | M | `/transactions` | `src/components/transactions/transaction-form.tsx` | 163 | Hint uses an em dash and "Positive number only". |
| T8 | M | `/transactions` | `src/components/transactions/transactions-view.tsx` | 587-606 | Three summary blocks repeat the KPI card pattern directly above a table. |

### Import

| ID | Severity | Screen | File | Lines | Issue |
| --- | --- | --- | --- | --- | --- |
| I1 | H | `/import` | `src/components/import/import-summary-cards.tsx` | 19-48 | Five icon `StatCard`s in a grid, exactly the repeated icon-card pattern. |
| I2 | M | `/import` | `src/components/import/import-wizard.tsx` | 1112 | Decorative animate-pulse block used as a placeholder outside a standard skeleton. |
| I3 | H | `/import` | `src/components/import/import-wizard.tsx` | 1217, 1305 | Uppercase tracked labels in the mapping/review steps. |
| I4 | M | `/import` | `src/components/import/import-wizard.tsx` | 759, 940-961, 1103, 1232 | Import explanations use five em dashes and long technical sentences. |
| I5 | M | `/import` | `src/components/import/import-wizard.tsx` | 1297-1330 | Inline sample and learning-rule messages use em dashes. |
| I6 | M | `/import` | `src/components/import/import-stepper.tsx` | 32-66 | Pills and chevrons create a generic stepper. It is visually louder than the file task. |
| I7 | M | `/import` | `src/components/import/import-history.tsx` | 50, 138 | Partial-import and failed-row copy uses em dashes. |
| I8 | M | `/import` | `src/components/import/import-rows-table.tsx` | 79, 188 | Em dashes in table placeholders and "Transfer - none". |
| I9 | M | `/import` | `src/components/import/import-exceptions.tsx` | 48 | Missing exception description renders an em dash. |
| I10 | M | `/import` | `src/components/import/import-history.tsx` | 74-152 | History is a stack of cards with badges. It should read like an activity ledger. |

### Reports

| ID | Severity | Screen | File | Lines | Issue |
| --- | --- | --- | --- | --- | --- |
| R1 | M | `/reports` | `src/components/reports/reports-view.tsx` | 33-95 | Six stacked report cards, each repeating a title, period, export control and table. |
| R2 | H | `/reports` | `src/components/reports/report-sections.tsx` | 263, 320-335, 419-428, 491-497, 566-572, 660 | Eighteen uppercase tracked table and section labels. The highest concentration in the app. |
| R3 | M | `/reports` | `src/components/reports/report-sections.tsx` | 166, 197 | Em dashes in comparison copy. |
| R4 | M | `/reports` | `src/components/reports/report-sections.tsx` | 715-735 | Loading skeleton uses four animate-pulse blocks. |
| R5 | M | `/reports` | `src/components/reports/reports-account-filter.tsx` | 51 | Uppercase tracked account filter label. |
| R6 | M | `/reports` | `src/components/reports/report-sections.tsx` | 229-456 | Summary and category reports use card wrappers around every table, so the page reads as a card stack. |
| R7 | M | `/reports` | `src/components/reports/report-sections.tsx` | 442-447 | Amounts are right aligned but lack a consistent tabular figure treatment across every section. |

### Insights

| ID | Severity | Screen | File | Lines | Issue |
| --- | --- | --- | --- | --- | --- |
| N1 | H | `/insights` | `src/components/insights/insights-shell.tsx` | 33, 50, 58, 110 | AI-first naming, sparkle icon in the empty state, and a disclaimer that leads the page. |
| N2 | H | `/insights` | `src/components/insights/insight-card.tsx` | 6, 26, 73 | Sparkle icon for the "Key insight" kind and an uppercase tracked metadata label. |
| N3 | H | `/insights` | `src/components/insights/insight-card.tsx` | 60-100 | Every insight is the same icon card, so the page becomes a repeated card grid. |
| N4 | M | `/insights` | `src/components/insights/insight-card.tsx` | 63 | "Suggested next step based on this period - review before acting." is generic and hedged. |
| N5 | M | `/insights` | `src/components/insights/insights-shell.tsx` | 72, 152 | Disclaimer and footer use em dashes and repeat the same "not a substitute" idea. |
| N6 | M | `/insights` | `src/components/insights/insights-shell.tsx` | 90-160 | Empty state offers two actions (import or add) and a long explanation. |

### Settings

| ID | Severity | Screen | File | Lines | Issue |
| --- | --- | --- | --- | --- | --- |
| E1 | M | `/settings` | `src/components/settings/settings-shell.tsx` | 44-77 | Settings uses generic tabs above the shell. Navigation and content are visually disconnected. |
| E2 | H | `/settings/rules` | `src/components/settings/rules-manager.tsx` | 5, 46, 68 | Two sparkle icons, including one in the empty state. |
| E3 | M | `/settings/rules` | `src/components/settings/rules-manager.tsx` | 48, 63 | Empty state uses an em dash and an uppercase tracked rule pattern. |
| E4 | M | `/settings/accounts` | `src/components/settings/accounts-manager.tsx` | 60-237 | Account rows are card-like with badges and action buttons; the screen should read as a register. |
| E5 | M | `/settings/categories` | `src/components/settings/categories-manager.tsx` | 70-319 | Category management uses a repeated card list and an uppercase tracked type label. |
| E6 | M | `/settings/security` | `src/components/settings/security-settings.tsx` | 134-137 | QR surface uses `bg-white` and an uppercase tracked label, breaking the warm neutral system. |
| E7 | M | `/settings/account` | `src/components/settings/account-settings.tsx` | 59, 99 | Export and delete copy use em dashes and a dramatic "only confirmation step" line. |
| E8 | L | `/settings/profile`, `/business` | `src/components/settings/profile-settings.tsx`, `business-settings.tsx` | 30-88, 35-124 | Form cards use the same Card treatment and generic descriptions as every other settings tab. |

### Ask surfaces (linked from old landing page)

| ID | Severity | Screen | File | Lines | Issue |
| --- | --- | --- | --- | --- | --- |
| Q1 | H | `/ask`, `/ask-v2` | `src/components/ask-v2/ask-v2-transcript.tsx` | 12, 43, 72 | Sparkle icon, rounded-xl user bubbles and "LedgerAI never guesses" copy with an em dash. |
| Q2 | M | `/ask`, `/ask-v2` | `src/components/ask-v2/ask-v2-composer.tsx` | 76 | Repeats "LedgerAI never guesses" under the composer. |
| Q3 | M | `/ask`, `/ask-v2` | `src/components/ask/ask-shell.tsx` | 278, 504, 566 | Em dashes in error and trust copy, plus a rounded-xl user bubble. |
| Q4 | M | `/ask-v2` | `src/components/ask-v2/ask-coming-soon.tsx` | 4, 37, 40 | Coming-soon surface is still shipped and linked. The landing page should not advertise it. |
| Q5 | M | `/ask`, `/ask-v2` | `src/components/ask/ask-history.tsx` | 52, 100 | Two uppercase tracked sidebar labels. |

### Copy system

| ID | Severity | Screen | File | Lines | Issue |
| --- | --- | --- | --- | --- | --- |
| C1 | H | All | 61 `.tsx` files | 148 lines | 151 em dashes, often used to join two clauses that should be separate sentences. |
| C2 | H | Landing, auth, empty states | `src/app/page.tsx`, `src/components/auth/*`, `src/components/dashboard/kpi-grid.tsx` | multiple | "Not X, Y" and "X, not Y" constructions: "Financial intelligence, not bookkeeping busywork" (`page.tsx:292`), "Built for owners, not accountants" (`page.tsx:554`), "not to replace your accountant" (`page.tsx:624`), "deterministic - not a substitute" (`insights-shell.tsx:72`). |
| C3 | H | All | multiple | multiple | Generic AI and intelligence language: "Financial intelligence", "AI Insights", "Plain-language insights", "AI is opt-in", "smart decisions". |
| C4 | H | All | multiple | multiple | No Nigerian banking context in the product copy. OPay, Kuda, GTBank, Moniepoint, POS, naira and transfer-heavy books are absent from meaningful UI copy. |
| C5 | M | All | multiple | multiple | Subtitles restate headings, for example every reports card title and period line, and every settings form title and description. |
| C6 | M | All | multiple | multiple | Same-length sentence rhythm in groups of three: "Import / Review / Profit", "CSV, Excel, PDF", three trust bullets, three feature cards. |
| C7 | M | Error surfaces | `src/components/ui/error-state.tsx`, `src/app/error.tsx` | 13-39, 26-52 | Errors say "Something went wrong" and "Please try again" without naming the failed action or the remedy. |
| C8 | M | Empty states | `src/components/ui/empty-state.tsx` and call sites | multiple | Empty states combine a cheerful line, a long paragraph and zero or several actions. Target is one line and one button. |
| C9 | M | All | multiple | multiple | British English is inconsistent: "categorize", "categorization", "behavior", "organization" appear alongside British spellings. |
| C10 | M | All | multiple | multiple | Placeholder glyphs `—` are used for missing data in tables and KPI loading states. Keep a single consistent placeholder only where a value is genuinely absent. |

## Design direction selected after audit

- Palette: deep ledger green (`#1c4b36`) as the single brand colour, warm paper neutrals (`#f4f0e7` background, `#fffdf8` surface), ink text (`#1d211c`), clay for debits (`#9a4a32`) and a restrained green for credits (`#2f6b4f`). The palette is deliberately closer to a printed ledger than a dashboard.
- Type: self-hosted **Bricolage Grotesque**, a variable sans with a compact, slightly editorial character and tabular figure support. It is used for both display and UI so the product has one voice. No Google Fonts request.
- Geometry: 6px cards, 4px fields. Borders carry structure. Shadows are reserved for menus, modals and drawers.
- Data: compact rows, right-aligned tabular amounts, sticky table headers, restrained debit/credit colour, no card per row.
- Wordmark: a three-rule ledger mark beside `LedgerAI`. No letter in a rounded box.
- Landing: five sections (hero with one product frame, how import works, one insight example, security note, closing CTA).
