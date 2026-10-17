import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  FileSpreadsheet,
  Lock,
  MessageSquare,
  Search,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Upload,
} from "lucide-react";
import { Accordion } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { getCurrentUser } from "@/lib/auth/server";

export const metadata: Metadata = {
  title: {
    absolute: "LedgerAI — Financial Intelligence for Small Businesses",
  },
  description:
    "Turn bank statements and transaction records into clear financial insights, reports, and smarter decisions.",
};

const primaryCta =
  "inline-flex h-11 items-center gap-2 rounded-button bg-brand px-5 text-base font-medium text-on-accent shadow-sm transition-colors hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40";
const secondaryCta =
  "inline-flex h-11 items-center gap-2 rounded-button border border-border-strong bg-surface px-5 text-base font-medium text-foreground transition-colors hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40";

const section = "mx-auto w-full max-w-6xl px-6";
const eyebrow =
  "text-xs font-semibold uppercase tracking-widest text-brand";
const heading =
  "text-2xl font-semibold tracking-tight text-foreground sm:text-3xl";
const lead = "mt-3 text-base leading-relaxed text-secondary sm:text-lg";

function Logo() {
  return (
    <span className="flex items-center gap-2">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-sm font-bold text-on-accent">
        L
      </span>
      <span className="font-semibold text-foreground">LedgerAI</span>
    </span>
  );
}

function FeatureCard({
  icon,
  title,
  badge,
  muted = false,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  /** Optional status tag rendered beside the title (e.g. "Coming soon"). */
  badge?: string;
  /** Visually de-emphasise a feature that is not shipped yet. */
  muted?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={
        muted
          ? "rounded-card border border-border bg-surface-subtle p-5 opacity-80"
          : "rounded-card border border-border bg-surface p-5"
      }
    >
      <span
        className={
          muted
            ? "flex h-10 w-10 items-center justify-center rounded-lg bg-surface text-subtle"
            : "flex h-10 w-10 items-center justify-center rounded-lg bg-brand-soft text-brand"
        }
      >
        {icon}
      </span>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {badge && (
          <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
            {badge}
          </Badge>
        )}
      </div>
      <p className="mt-1.5 text-sm leading-relaxed text-secondary">{children}</p>
    </div>
  );
}

/**
 * Static, dependency-free product preview for the hero's right column.
 * Illustrative NGN figures only — no live data, no external images. Hidden
 * below `lg` so the hero stays text-first on mobile.
 */
function HeroPreview() {
  const kpis: Array<[string, string, string]> = [
    ["Income", "₦1,240,000", "text-success"],
    ["Expenses", "₦612,400", "text-danger"],
    ["Net", "₦627,600", "text-foreground"],
  ];

  return (
    <div
      aria-hidden="true"
      className="rounded-card border border-border bg-background p-5 shadow-card"
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          This month
        </p>
        <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-xs font-medium text-success">
          <TrendingUp className="h-3 w-3" aria-hidden="true" />
          +12%
        </span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        {kpis.map(([label, value, tone]) => (
          <div
            key={label}
            className="rounded-field border border-border bg-surface p-3"
          >
            <p className="text-[10px] uppercase tracking-wide text-muted">
              {label}
            </p>
            <p className={`mt-1 text-sm font-semibold tabular-nums ${tone}`}>
              {value}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-field border border-border bg-surface p-4">
        <p className="text-xs uppercase tracking-wide text-muted">
          Net profit trend
        </p>
        <svg viewBox="0 0 320 100" className="mt-3 h-24 w-full" preserveAspectRatio="none">
          <defs>
            <linearGradient id="heroAreaFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.35" />
              <stop offset="100%" stopColor="var(--brand)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d="M0,72 L40,58 L80,64 L120,40 L160,50 L200,26 L240,34 L280,18 L320,24 L320,100 L0,100 Z"
            fill="url(#heroAreaFill)"
          />
          <path
            d="M0,72 L40,58 L80,64 L120,40 L160,50 L200,26 L240,34 L280,18 L320,24"
            fill="none"
            stroke="var(--brand)"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </svg>
        <div className="mt-1 flex justify-between text-[10px] text-muted">
          <span>May</span>
          <span>Jun</span>
          <span>Jul</span>
          <span>Aug</span>
          <span>Sep</span>
          <span>Oct</span>
        </div>
      </div>
    </div>
  );
}

/** Static, labelled monthly-trend preview (illustrative NGN thousands). */
function MonthlyTrendChart() {
  const months = ["May", "Jun", "Jul", "Aug", "Sep", "Oct"];
  const values = [38, 55, 47, 72, 61, 84]; // thousands of naira
  const max = 120;
  const plotLeft = 40;
  const plotRight = 316;
  const slot = 46;
  const barWidth = 22;
  const baseline = 100;
  const top = 12;
  const gridlines = [
    { y: top, label: "₦120k" },
    { y: (top + baseline) / 2, label: "₦60k" },
    { y: baseline, label: "₦0" },
  ];

  return (
    <div className="mt-4 rounded-field border border-border bg-surface p-3">
      <p className="text-xs uppercase tracking-wide text-muted">Monthly trend</p>
      <svg viewBox="0 0 320 132" className="mt-3 w-full">
        {gridlines.map((g) => (
          <g key={g.label}>
            <line
              x1={plotLeft}
              y1={g.y}
              x2={plotRight}
              y2={g.y}
              stroke="var(--border)"
              strokeWidth="1"
            />
            <text
              x={36}
              y={g.y + 3}
              textAnchor="end"
              className="fill-subtle text-[9px]"
            >
              {g.label}
            </text>
          </g>
        ))}
        {values.map((value, i) => {
          const height = (value / max) * (baseline - top);
          const x = plotLeft + slot * i + (slot - barWidth) / 2;
          return (
            <rect
              key={months[i]}
              x={x}
              y={baseline - height}
              width={barWidth}
              height={height}
              rx="3"
              fill="var(--brand)"
              opacity="0.75"
            />
          );
        })}
        {months.map((month, i) => (
          <text
            key={month}
            x={plotLeft + slot * i + slot / 2}
            y={124}
            textAnchor="middle"
            className="fill-muted text-[9px]"
          >
            {month}
          </text>
        ))}
      </svg>
    </div>
  );
}

export default async function Home() {
  // Session-aware marketing nav: a signed-in visitor gets a direct route back
  // into the app. We only READ the session — the landing page is deliberately
  // never redirected, so it stays viewable while authenticated.
  const user = await getCurrentUser().catch(() => null);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* ---------------------------------------------------------- Header */}
      <header className="border-b border-border bg-surface">
        <div className={`${section} flex h-16 items-center justify-between`}>
          <Link href="/" aria-label="LedgerAI home">
            <Logo />
          </Link>
          <nav className="flex items-center gap-3">
            {user ? (
              <Link href="/overview" className={`${primaryCta} h-9 px-4 text-sm`}>
                Go to dashboard
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="inline-flex h-11 items-center text-sm font-medium text-foreground transition-colors hover:text-brand"
                >
                  Sign in
                </Link>
                <Link href="/signup" className={`${primaryCta} h-9 px-4 text-sm`}>
                  Get started
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* -------------------------------------------------------- Hero */}
        <section className="border-b border-border bg-surface">
          <div className={`${section} py-16 sm:py-24`}>
            <div className="grid items-center gap-12 lg:grid-cols-2">
              <div className="max-w-2xl">
                <p className={eyebrow}>Financial intelligence, not bookkeeping busywork</p>
                <h1 className="mt-4 text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-5xl">
                  Know exactly where your business stands.
                </h1>
                <p className={lead}>
                  LedgerAI turns raw bank statements into clean books, clear
                  reports, and plain-language insights — so you can spend less
                  time reconciling and more time running the business.
                </p>
                <div className="mt-8 flex flex-wrap items-center gap-3">
                  <Link href="/signup" className={primaryCta}>
                    Create your free account
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                  <Link href="/login" className={secondaryCta}>
                    Sign in
                  </Link>
                </div>
                <p className="mt-4 text-sm text-muted">
                  Works with CSV, Excel and PDF statements · No spreadsheets, no
                  accounting jargon.
                </p>
              </div>

              <div className="hidden lg:block">
                <HeroPreview />
              </div>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------ Problem */}
        <section>
          <div className={`${section} py-16 sm:py-20`}>
            <p className={eyebrow}>The problem</p>
            <h2 className={`${heading} mt-3 max-w-2xl`}>
              Small businesses don&apos;t fail from lack of work — they fail from
              blurry numbers.
            </h2>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-card border border-border bg-surface p-5">
                <h3 className="text-sm font-semibold text-foreground">
                  Records live everywhere
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-secondary">
                  Statements in your inbox, sales in a notebook, expenses on a
                  card — nothing lines up when you need it.
                </p>
              </div>
              <div className="rounded-card border border-border bg-surface p-5">
                <h3 className="text-sm font-semibold text-foreground">
                  Decisions on gut feel
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-secondary">
                  Without a real profit number, every price cut, hire, or big
                  purchase is a guess.
                </p>
              </div>
              <div className="rounded-card border border-border bg-surface p-5">
                <h3 className="text-sm font-semibold text-foreground">
                  Tax time becomes a scramble
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-secondary">
                  Months of missing receipts and uncategorised rows turn into
                  weekends you will never get back.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------- How it works */}
        <section className="border-y border-border bg-surface">
          <div className={`${section} py-16 sm:py-20`}>
            <p className={eyebrow}>How it works</p>
            <h2 className={`${heading} mt-3`}>From statement to insight in three steps.</h2>
            <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[
                {
                  step: "1",
                  title: "Import your transactions",
                  body: "Drop in a CSV, Excel, or PDF bank statement. LedgerAI detects your columns and lets you map anything it isn't sure about.",
                },
                {
                  step: "2",
                  title: "Review and categorise",
                  body: "Duplicates are caught before they touch your books, categories are suggested from your own rules, and every row is editable before you commit.",
                },
                {
                  step: "3",
                  title: "Read the answers",
                  body: "Reports, month-over-month insights, and clear, explainable numbers — no formulas required.",
                },
              ].map((item) => (
                <li
                  key={item.step}
                  className="rounded-card border border-border bg-background p-5"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-sm font-semibold text-on-accent">
                    {item.step}
                  </span>
                  <h3 className="mt-4 text-sm font-semibold text-foreground">
                    {item.title}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-secondary">
                    {item.body}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ------------------------------------------------------ Features */}
        <section>
          <div className={`${section} py-16 sm:py-20`}>
            <p className={eyebrow}>Features</p>
            <h2 className={`${heading} mt-3`}>Everything a small business actually needs.</h2>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <FeatureCard icon={<BarChart3 className="h-5 w-5" aria-hidden="true" />} title="Clean books">
                Income, expenses, transfers, and accounts with validation on
                every field — nothing ambiguous gets in.
              </FeatureCard>
              <FeatureCard icon={<Upload className="h-5 w-5" aria-hidden="true" />} title="Statement import">
                CSV, Excel, and PDF statements with column mapping, duplicate
                detection, and one atomic, reviewable commit.
              </FeatureCard>
              <FeatureCard icon={<CheckCircle2 className="h-5 w-5" aria-hidden="true" />} title="Categories that learn">
                Rules you can read and edit. When you correct a suggestion,
                LedgerAI remembers it for next time.
              </FeatureCard>
              <FeatureCard icon={<FileSpreadsheet className="h-5 w-5" aria-hidden="true" />} title="Real reports">
                Summary, monthly P&amp;L, category breakdowns, income and
                expense statements — each exportable as CSV or PDF.
              </FeatureCard>
              <FeatureCard icon={<Sparkles className="h-5 w-5" aria-hidden="true" />} title="Plain-language insights">
                What changed this month, why, and what to watch — written as
                sentences, not charts you have to decode.
              </FeatureCard>
              <FeatureCard
                muted
                badge="Coming soon"
                icon={<MessageSquare className="h-5 w-5" aria-hidden="true" />}
                title="Ask your ledger"
              >
                Plain-language questions over your own records are on the
                roadmap. It isn&apos;t available yet.
              </FeatureCard>
            </div>
          </div>
        </section>

        {/* -------------------------------------------- Dashboard preview */}
        <section className="border-y border-border bg-surface">
          <div className={`${section} py-16 sm:py-20`}>
            <div className="grid items-center gap-10 lg:grid-cols-2">
              <div>
                <p className={eyebrow}>Your dashboard</p>
                <h2 className={`${heading} mt-3`}>The numbers that matter, at a glance.</h2>
                <p className={lead}>
                  Revenue, expenses, net profit, and cash balance — computed by
                  the same engine that powers every report, so the KPIs on your
                  overview can never disagree with your exports.
                </p>
                <ul className="mt-6 space-y-2.5">
                  {[
                    "KPIs that reconcile with reports, every time",
                    "Trends for revenue, expenses, and net profit",
                    "Filter any range and export what you see",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2 text-sm text-secondary">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div
                aria-hidden="true"
                className="rounded-card border border-border bg-background p-5 shadow-sm"
              >
                <div className="grid grid-cols-2 gap-3">
                  {[
                    ["Revenue", "₦1,240,000", "text-success"],
                    ["Expenses", "₦612,400", "text-danger"],
                    ["Net profit", "₦627,600", "text-foreground"],
                    ["Cash balance", "₦845,200", "text-foreground"],
                  ].map(([label, value, tone]) => (
                    <div key={label} className="rounded-field border border-border bg-surface p-3">
                      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
                      <p className={`mt-1 text-lg font-semibold tabular-nums ${tone}`}>{value}</p>
                    </div>
                  ))}
                </div>
                <MonthlyTrendChart />
              </div>
            </div>
          </div>
        </section>

        {/* -------------------------------------------------- AI insights */}
        <section>
          <div className={`${section} py-16 sm:py-20`}>
            <div className="grid items-start gap-10 lg:grid-cols-2">
              <div>
                <p className={eyebrow}>Insights</p>
                <h2 className={`${heading} mt-3`}>A finance analyst in plain English.</h2>
                <p className={lead}>
                  Every month, LedgerAI walks your numbers and writes what
                  changed, what caused it, and what deserves attention — built
                  from deterministic analysis of your own data, so it is always
                  explainable. Optional AI modes stay off unless you turn them on.
                </p>
              </div>
              <div className="rounded-card border border-border bg-brand-soft p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-brand">
                  This month
                </p>
                <p className="mt-3 text-sm leading-relaxed text-foreground">
                  Net profit fell <span className="font-semibold">18%</span> versus last
                  month. Transport costs rose by{" "}
                  <span className="font-semibold">₦42,000</span> while revenue stayed
                  flat — worth checking whether courier rates changed.
                </p>
                <p className="mt-3 text-xs text-muted">
                  Example of a generated insight — every figure traces back to
                  your transactions.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* -------------------------------------------------------- Import */}
        <section className="border-y border-border bg-surface">
          <div className={`${section} py-16 sm:py-20`}>
            <p className={eyebrow}>Import</p>
            <h2 className={`${heading} mt-3`}>Bring your history with you.</h2>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <FeatureCard icon={<FileSpreadsheet className="h-5 w-5" aria-hidden="true" />} title="CSV, Excel, PDF">
                Three formats out of the box, with automatic column detection and
                a mapping step whenever the file is unusual.
              </FeatureCard>
              <FeatureCard icon={<ShieldCheck className="h-5 w-5" aria-hidden="true" />} title="No duplicate rows">
                A fingerprint of date, amount, description, reference, and
                account catches duplicates across files — and against what is
                already in your ledger.
              </FeatureCard>
              <FeatureCard icon={<Search className="h-5 w-5" aria-hidden="true" />} title="Review before commit">
                See exactly what will be imported, fix categories row by row,
                and commit everything in one atomic step — or not at all.
              </FeatureCard>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------ Benefits */}
        <section>
          <div className={`${section} py-16 sm:py-20`}>
            <div className="grid gap-10 lg:grid-cols-2">
              <div>
                <p className={eyebrow}>Why LedgerAI</p>
                <h2 className={`${heading} mt-3`}>Built for owners, not accountants.</h2>
                <p className={lead}>
                  No chart-of-accounts setup, no jargon, no month-end ritual.
                  Import what your bank gives you and read the answers.
                </p>
              </div>
              <ul className="grid gap-3">
                {[
                  "Numbers you can trust — one engine behind KPIs, reports, and exports",
                  "Minutes, not evenings — import and understand in a single sitting",
                  "Yours to take — CSV exports and print-to-PDF on every report",
                  "Works offline of your bank — no connection, no per-bank integration",
                ].map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-3 rounded-card border border-border bg-surface p-4 text-sm text-secondary"
                  >
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------ Security */}
        <section className="border-y border-border bg-surface">
          <div className={`${section} py-16 sm:py-20`}>
            <p className={eyebrow}>Security</p>
            <h2 className={`${heading} mt-3`}>Your books stay yours.</h2>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <FeatureCard icon={<Lock className="h-5 w-5" aria-hidden="true" />} title="Tenant isolation">
                Every row is scoped to your business at the application layer
                and again with database row-level security.
              </FeatureCard>
              <FeatureCard icon={<ShieldCheck className="h-5 w-5" aria-hidden="true" />} title="Hardened defaults">
                Strict content security policy, security headers, and rate
                limits on sign-in, import, and AI routes.
              </FeatureCard>
              <FeatureCard icon={<CheckCircle2 className="h-5 w-5" aria-hidden="true" />} title="Validated everything">
                Every input passes schema validation on the server — the client
                is never trusted.
              </FeatureCard>
              <FeatureCard icon={<Sparkles className="h-5 w-5" aria-hidden="true" />} title="AI is opt-in">
                Deterministic answers work with zero configuration. LLM modes
                stay disabled unless you explicitly enable them.
              </FeatureCard>
            </div>
          </div>
        </section>

        {/* ----------------------------------------------------------- FAQ */}
        <section>
          <div className={`${section} max-w-3xl py-16 sm:py-20`}>
            <p className={eyebrow}>FAQ</p>
            <h2 className={`${heading} mt-3`}>Questions, answered.</h2>
            <div className="mt-8">
              <Accordion
                items={[
                  {
                    value: "what",
                    title: "What is LedgerAI?",
                    children:
                      "LedgerAI is a bookkeeping assistant for small businesses. It imports your bank statements, keeps your income and expenses organised, and turns them into reports, insights, and answers you can actually read.",
                  },
                  {
                    value: "accounting",
                    title: "Is it accounting software?",
                    children:
                      "It covers the day-to-day — transactions, categories, reports, and exports — without double-entry accounting setup. It is designed to give you clarity fast, not to replace your accountant at year end.",
                  },
                  {
                    value: "bank",
                    title: "Does it connect to my bank?",
                    children:
                      "No connection is required. You export a statement from your bank (CSV, Excel, or PDF) and import it. That keeps you in control and works with any bank.",
                  },
                  {
                    value: "safe",
                    title: "Is my data safe?",
                    children:
                      "Yes. Every record is isolated per business at the application layer and enforced again with database row-level security. Traffic is encrypted, inputs are validated server-side, and sensitive keys never reach the browser.",
                  },
                  {
                    value: "export",
                    title: "Can I get my data out?",
                    children:
                      "Yes. Every report exports as CSV, and any page can be printed or saved as a PDF from your browser.",
                  },
                ]}
              />
            </div>
          </div>
        </section>

        {/* ----------------------------------------------------------- CTA */}
        <section className="border-t border-border bg-brand-soft">
          <div className={`${section} py-16 text-center sm:py-20`}>
            <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              See your business clearly — starting today.
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-base text-secondary">
              Create an account, import a statement, and read your first report
              in minutes.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link href="/signup" className={primaryCta}>
                Create your free account
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link href="/login" className={secondaryCta}>
                Sign in
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* --------------------------------------------------------- Footer */}
      <footer className="border-t border-border bg-surface">
        <div
          className={`${section} flex flex-col items-center justify-between gap-4 py-8 sm:flex-row`}
        >
          <Link href="/" aria-label="LedgerAI home">
            <Logo />
          </Link>
          <nav className="flex flex-wrap items-center justify-center gap-5 text-sm text-secondary">
            <Link href="/login" className="transition-colors hover:text-foreground">
              Sign in
            </Link>
            <Link href="/signup" className="transition-colors hover:text-foreground">
              Get started
            </Link>
            <Link href="/privacy" className="transition-colors hover:text-foreground">
              Privacy
            </Link>
            <Link href="/terms" className="transition-colors hover:text-foreground">
              Terms
            </Link>
            <a
              href="mailto:ifeoluwaniolufunmilayo@gmail.com"
              className="transition-colors hover:text-foreground"
            >
              Contact
            </a>
          </nav>
          <p className="text-sm text-muted">
            © {new Date().getFullYear()} LedgerAI. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
