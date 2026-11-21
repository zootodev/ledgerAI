import * as React from "react";
import Link from "next/link";
import { Wordmark } from "@/components/brand/wordmark";

const sampleRows = [
  ["02 Nov", "POS settlement", "+₦143,600"],
  ["02 Nov", "Mama Nkechi foods", "-₦84,600"],
  ["04 Nov", "Shop rent", "-₦95,000"],
  ["06 Nov", "POS terminal fee", "-₦3,950"],
];

/**
 * Shared shell for the auth route group. The form stays on a quiet paper card;
 * the wide panel shows a real ledger rather than a three-step sales pitch.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="theme-ledgerai min-h-screen bg-background">
      <main className="grid min-h-screen lg:grid-cols-[1fr_1.05fr]">
        <aside className="hidden flex-col justify-between border-r border-border bg-surface px-10 py-9 lg:flex">
          <Link href="/" aria-label="LedgerAI home">
            <Wordmark />
          </Link>

          <div className="max-w-md">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand">
              A ledger you can read
            </p>
            <h2 className="mt-3 text-[34px] font-semibold leading-[1.08] tracking-[-0.04em] text-foreground">
              The month, line by line.
            </h2>
            <div className="mt-7 overflow-hidden rounded-card border border-border bg-background">
              <div className="flex items-center justify-between border-b border-border px-3 py-2">
                <span className="text-[11px] text-muted">Morrow Foods</span>
                <span className="text-[11px] text-subtle">November 2026</span>
              </div>
              <table className="w-full border-collapse text-sm">
                <tbody className="divide-y divide-border">
                  {sampleRows.map(([date, description, amount]) => (
                    <tr key={`${date}-${description}`}>
                      <td className="px-3 py-2.5 text-[11px] tabular-nums text-muted">
                        {date}
                      </td>
                      <td className="px-2 py-2.5 text-foreground">{description}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-foreground">
                        {amount}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <p className="max-w-sm text-xs leading-5 text-muted">
            OPay, Kuda, GTBank, Moniepoint. Statements in, a clean record out.
          </p>
        </aside>

        <div className="flex flex-col justify-center px-5 py-10 sm:px-8">
          <div className="mx-auto w-full max-w-md">
            <Link
              href="/"
              aria-label="LedgerAI home"
              className="mb-7 inline-flex lg:hidden"
            >
              <Wordmark />
            </Link>
            <div className="rounded-card border border-border bg-surface p-6 sm:p-8">
              {children}
            </div>
            <footer className="mt-6 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs text-muted">
              <span>© {new Date().getFullYear()}{" "}LedgerAI</span>
              <span aria-hidden="true">·</span>
              <Link href="/privacy" className="transition-colors hover:text-foreground">
                Privacy
              </Link>
              <span aria-hidden="true">·</span>
              <Link href="/terms" className="transition-colors hover:text-foreground">
                Terms
              </Link>
            </footer>
          </div>
        </div>
      </main>
    </div>
  );
}
