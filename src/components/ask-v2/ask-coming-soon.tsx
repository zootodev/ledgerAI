"use client";

// ============================================================
// LedgerAI — Ask v2 unavailable notice
// ------------------------------------------------------------
// Presentation-only fallback kept for the gated /ask-v2 route. It
// renders NO assistant surface: no composer, no server action, no
// provider call, no finance tooling, and no persistence. The route
// itself currently 404s; this component exists so the gate can be
// re-enabled behind the same switch without reviving a marketing card.
// ============================================================

import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { buttonVariants } from "@/components/ui/button";

export interface AskComingSoonProps {
  userName?: string;
  userEmail: string;
  onSignOut?: () => void;
}

export function AskComingSoon({ userName, userEmail, onSignOut }: AskComingSoonProps) {
  return (
    <AppShell
      onSignOut={onSignOut}
      header={{
        title: "Ask",
        user: userName ? { name: userName, email: userEmail } : null,
      }}
    >
      <div className="mx-auto max-w-xl space-y-3 py-10">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Ask isn&apos;t open yet
        </h1>
        <p className="text-sm text-muted">
          This preview is switched off. Your books are still on the overview.
        </p>
        <div>
          <Link href="/overview" className={buttonVariants({ variant: "outline" })}>
            Go to overview
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
