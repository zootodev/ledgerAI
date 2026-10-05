"use client";

// ============================================================
// LedgerAI — Ask v2 Coming Soon (Phase 22 product freeze)
// ------------------------------------------------------------
// Presentation-only state shown to authenticated users at /ask-v2
// while ASK_V2_ENABLED is off. It renders NO assistant surface:
// no composer, no server action, no provider call, no finance
// tooling, and no conversation persistence. The interactive
// AskV2Chat is mounted only in the gate-enabled branch of
// page.tsx, so this component can never reach the Ask backend.
// ============================================================

import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

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
        title: "Ask LedgerAI",
        user: userName ? { name: userName, email: userEmail } : null,
      }}
    >
      <div className="mx-auto flex min-w-0 max-w-xl flex-col items-center py-10 sm:py-16">
        <Card className="w-full">
          <CardContent className="flex flex-col items-center gap-4 px-6 py-10 text-center sm:px-10">
            <Badge tone="brand" variant="soft">
              Coming Soon
            </Badge>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Ask is coming soon
            </h1>
            <p className="max-w-md text-sm leading-relaxed text-muted">
              We&apos;re building a smarter way to help you understand your business
              finances, explore your spending, and get useful insights from your data.
            </p>
            <p className="text-sm text-subtle">
              Ask will let you explore your finances using natural language.
            </p>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}