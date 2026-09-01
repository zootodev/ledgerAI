import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ensureOnboarding } from "@/lib/services/auth";
import { requireAuthContext } from "@/lib/services/auth-context";
import { signOutAction } from "@/lib/auth/actions";
import { OverviewShell } from "@/components/dashboard/overview-shell";
import { AnalyticsKpiGrid, KpiGridFallback } from "@/components/dashboard/kpi-grid";

export const metadata: Metadata = {
  title: "Overview",
};

export default async function OverviewPage() {
  // First authenticated visit: make sure the profile + business exist so
  // tenant isolation (user/business ownership) has rows to key on.
  await ensureOnboarding();

  const ctx = await requireAuthContext().catch(() => null);
  if (!ctx) redirect("/login");

  return (
    <OverviewShell
      userName={ctx.user.name ?? undefined}
      userEmail={ctx.user.email}
      businessName={ctx.business.name}
      currency={ctx.business.currency}
      kpis={
        <Suspense fallback={<KpiGridFallback />}>
          <AnalyticsKpiGrid currency={ctx.business.currency} />
        </Suspense>
      }
      onSignOut={signOutAction}
    />
  );
}