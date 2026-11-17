import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/server";
import { DATA_CONTROLLER, PRIVACY_PATH, TERMS_PATH } from "@/lib/legal/constants";
import { Wordmark } from "@/components/brand/wordmark";

export const metadata: Metadata = {
  title: {
    absolute: "LedgerAI | Simple books for Nigerian small businesses",
  },
  description:
    "Upload OPay, Kuda, GTBank or Moniepoint statements and keep a clean record of sales, transfers and expenses.",
};

const primaryCta =
  "inline-flex h-10 items-center justify-center rounded-button bg-brand px-4 text-sm font-medium text-on-accent transition-colors hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-background";
const secondaryCta =
  "inline-flex h-10 items-center justify-center rounded-button border border-border-strong bg-surface px-4 text-sm font-medium text-foreground transition-colors hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-background";
const section = "mx-auto w-full max-w-6xl px-5 sm:px-6";
const heading =
  "text-2xl font-semibold leading-tight tracking-[-0.03em] text-foreground sm:text-[32px]";

export default async function HomePage() {
  const user = await getCurrentUser().catch(() => null);

  return (
    <div className="theme-ledgerai min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95">
        <div className={`${section} flex h-14 items-center justify-between gap-4`}>
          <Link href="/" aria-label="LedgerAI home" className="shrink-0">
            <Wordmark />
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-secondary sm:flex" aria-label="Landing">
            <a href="#import" className="transition-colors hover:text-foreground">
              Import
            </a>
            <a href="#insights" className="transition-colors hover:text-foreground">
              Reading the books
            </a>
            <a href="#security" className="transition-colors hover:text-foreground">
              Your data
            </a>
          </nav>
          <div className="flex items-center gap-2">
            {user ? (
              <Link href="/overview" className={primaryCta}>
                Open your books
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="hidden h-10 items-center px-3 text-sm font-medium text-foreground transition-colors hover:text-brand sm:inline-flex"
                >
                  Sign in
                </Link>
                <Link href="/signup" className={primaryCta}>
                  Start with a statement
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main>
        <section className="border-b border-border">
          <div className={`${section} grid gap-10 py-12 sm:py-16 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:gap-12 lg:py-20`}>
            <div className="max-w-xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand">
                For Nigerian small businesses
              </p>
              <h1 className="mt-4 text-[38px] font-semibold leading-[1.04] tracking-[-0.045em] text-foreground sm:text-[56px]">
                Your OPay, Kuda and GTBank records, in one set of books.
              </h1>
              <p className="mt-5 max-w-lg text-[17px] leading-7 text-secondary">
                Upload the statements you already get. LedgerAI sorts POS takings,
                transfers and expenses into a record you can check, then shows what
                the month actually left.
              </p>
              <div className="mt-7 flex flex-wrap items-center gap-3">
                <Link href={user ? "/overview" : "/signup"} className={primaryCta}>
                  {user ? "Open your books" : "Start with a statement"}
                </Link>
                <Link href="/login" className={`${secondaryCta} ${user ? "hidden" : ""}`}>
                  I already have an account
                </Link>
              </div>
              <p className="mt-4 text-xs leading-5 text-muted">
                CSV, Excel and PDF. Naira first. No bank connection needed.
              </p>
            </div>

            <figure className="min-w-0">
              <div className="overflow-hidden rounded-card border border-border-strong bg-surface">
                <div className="flex min-w-0 items-center justify-between gap-3 border-b border-border bg-surface-subtle px-3 py-2">
                  <span
                    className="min-w-0 truncate text-[11px] font-medium text-muted"
                    title="ledgerai-zootodev.vercel.app/overview"
                  >
                    ledgerai-zootodev.vercel.app/overview
                  </span>
                  <span className="shrink-0 text-[11px] text-subtle">Adaeze&apos;s Bakery</span>
                </div>
                <Image
                  src="/product-overview.png"
                  alt="LedgerAI overview showing October takings, expenses and a list of recent transactions"
                  width={1440}
                  height={1000}
                  priority
                  sizes="(min-width: 1024px) 54vw, 100vw"
                  className="h-auto w-full"
                />
              </div>
              <figcaption className="mt-2 text-xs leading-5 text-muted">
                A sample bakery&apos;s October, imported from a GTBank CSV.
              </figcaption>
            </figure>
          </div>
        </section>

        <section id="import" className="border-b border-border">
          <div className={`${section} grid gap-10 py-14 sm:py-16 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16`}>
            <div>
              <h2 className={heading}>From statement to ledger, without retyping it.</h2>
              <p className="mt-4 text-[15px] leading-7 text-secondary">
                Banks write the same transaction three different ways. You only need
                to teach LedgerAI once, then check the rows that matter.
              </p>
              <p className="mt-5 text-sm leading-6 text-muted">
                Works with the exports you already download from OPay, Kuda, GTBank,
                Moniepoint, Access and Zenith.
              </p>
            </div>

            <ol className="divide-y divide-border border-y border-border">
              {[
                {
                  title: "Choose the file",
                  body: "Drop in a CSV, Excel sheet or PDF statement. The original stays out of the ledger.",
                },
                {
                  title: "Map only what is missing",
                  body: "If your bank uses an odd heading, point it at the right column once. Remembered for the next import.",
                },
                {
                  title: "Check the duplicates",
                  body: "A POS settlement imported twice is caught before it reaches the books. No silent double counting.",
                },
                {
                  title: "Commit the rows",
                  body: "Pick categories, leave unclear rows in review, then write everything in one step. All or nothing.",
                },
              ].map((step, index) => (
                <li key={step.title} className="grid grid-cols-[2.5rem_1fr] gap-3 py-5">
                  <span className="text-sm font-medium tabular-nums text-subtle">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <h3 className="text-[15px] font-semibold text-foreground">
                      {step.title}
                    </h3>
                    <p className="mt-1 text-sm leading-6 text-secondary">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="insights" className="border-b border-border bg-surface">
          <div className={`${section} grid gap-10 py-14 sm:py-16 lg:grid-cols-[1.05fr_0.95fr] lg:items-start lg:gap-16`}>
            <div>
              <h2 className={heading}>A page you can read before month end.</h2>
              <p className="mt-4 max-w-xl text-[15px] leading-7 text-secondary">
                Takings, supplier payments and recurring costs sit together. When one
                line moves, LedgerAI tells you which rows moved it.
              </p>
              <div className="mt-7 border-l-2 border-brand pl-4">
                <p className="text-sm font-medium text-foreground">
                  Transport cost ₦22,400 more than October.
                </p>
                <p className="mt-2 max-w-lg text-sm leading-6 text-secondary">
                  Two Bolt deliveries on 9 November and a third on 12 November
                  carried most of the increase. The rest came from a fare to Mushin
                  on the 7th.
                </p>
              </div>
            </div>

            <div className="rounded-card border border-border bg-background">
              <div className="border-b border-border px-4 py-3">
                <p className="text-sm font-medium text-foreground">November so far</p>
                <p className="mt-0.5 text-xs text-muted">Compared with October</p>
              </div>
              <dl className="divide-y divide-border">
                {[
                  ["Takings", "₦355,550", "+₦41,939"],
                  ["Suppliers and stock", "₦163,800", "-₦8,714"],
                  ["Transport", "₦35,860", "+₦22,400"],
                  ["Rent and wages", "₦173,000", "No change"],
                ].map(([label, value, change]) => (
                  <div
                    key={label}
                    className="grid grid-cols-[1fr_auto] items-baseline gap-4 px-4 py-3"
                  >
                    <dt className="text-sm text-secondary">{label}</dt>
                    <dd className="text-right">
                      <span className="block text-sm font-medium tabular-nums text-foreground">
                        {value}
                      </span>
                      <span className="block text-[11px] tabular-nums text-muted">
                        {change}
                      </span>
                    </dd>
                  </div>
                ))}
              </dl>
              <div className="border-t border-border px-4 py-3">
                <p className="text-xs leading-5 text-muted">
                  Every figure is calculated from rows in the ledger. Change a row and
                  the figure changes with it.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section id="security" className="border-b border-border">
          <div className={`${section} grid gap-8 py-12 sm:py-14 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16`}>
            <h2 className={heading}>Your statements stay yours.</h2>
            <div className="max-w-2xl space-y-4 text-[15px] leading-7 text-secondary">
              <p>
                Statements are parsed on our server. The rows live in your business
                account, and another business cannot open them.
              </p>
              <p>
                LedgerAI does not connect to your bank and cannot move money. You
                upload a file; we keep the record. Export it as CSV or print it from
                any report whenever you want it back.
              </p>
              <p className="text-sm">
                <Link
                  href={PRIVACY_PATH}
                  className="font-medium text-brand underline underline-offset-4"
                >
                  Read the privacy notice
                </Link>
                .
              </p>
            </div>
          </div>
        </section>

        <section>
          <div className={`${section} flex flex-col items-start justify-between gap-6 py-12 sm:flex-row sm:items-center sm:py-14`}>
            <div>
              <h2 className="text-[26px] font-semibold leading-tight tracking-[-0.03em] text-foreground sm:text-[30px]">
                Start with last month&apos;s statement.
              </h2>
              <p className="mt-2 text-sm leading-6 text-secondary">
                One file is enough to see whether the books add up.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href={user ? "/overview" : "/signup"} className={primaryCta}>
                {user ? "Open your books" : "Create an account"}
              </Link>
              <Link href="#import" className={secondaryCta}>
                See how import works
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className={`${section} flex flex-col gap-3 py-6 text-xs text-muted sm:flex-row sm:items-center sm:justify-between`}>
          <p>
            © {new Date().getFullYear()} {DATA_CONTROLLER}
          </p>
          <div className="flex items-center gap-4">
            <Link href={PRIVACY_PATH} className="hover:text-foreground">
              Privacy
            </Link>
            <Link href={TERMS_PATH} className="hover:text-foreground">
              Terms
            </Link>
            <Link href="/login" className="hover:text-foreground">
              Sign in
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
