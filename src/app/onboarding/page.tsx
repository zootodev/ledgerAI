import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ensureOnboarding } from "@/lib/services/auth";
import { requireAuthContext } from "@/lib/services/auth-context";
import { getBusinessProfile } from "@/lib/services/business";
import { OnboardingForm } from "@/components/onboarding/onboarding-form";

export const metadata: Metadata = {
  title: "Set up your business",
};

/**
 * First-run onboarding. Provisioning happens through ensureOnboarding (no
 * bounce — this IS the bounce target), then an already-finished profile is
 * sent back to the dashboard so the URL never loops.
 */
export default async function OnboardingPage() {
  await ensureOnboarding({ bounce: false });

  const ctx = await requireAuthContext().catch(() => null);
  if (!ctx) redirect("/login");

  const profile = await getBusinessProfile();
  if (profile.type !== null) redirect("/overview");

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-lg">
        <div className="mb-6 flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-sm font-bold text-on-accent">
            L
          </span>
          <span className="font-semibold text-foreground">LedgerAI</span>
        </div>
        <OnboardingForm
          defaults={{
            name: profile.name,
            country: profile.country,
            currency: profile.currency,
          }}
        />
      </div>
    </main>
  );
}
