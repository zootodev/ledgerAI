import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ensureOnboarding } from "@/lib/services/auth";
import { requireAuthContext } from "@/lib/services/auth-context";
import { signOutAction } from "@/lib/auth/actions";
import { isAskV2Enabled } from "@/lib/ask-v2/config";
import { AskV2Chat } from "@/components/ask-v2/ask-v2-chat";
import { AskComingSoon } from "@/components/ask-v2/ask-coming-soon";

export const metadata: Metadata = {
  title: "Ask LedgerAI",
};

export const dynamic = "force-dynamic";

export default async function AskV2Page() {
  // B-2: independent server-side gate. ASK_V2_ENABLED (safe default OFF) is
  // the ONLY switch for the interactive assistant. While it is off, the user
  // sees the presentation-only "Coming Soon" state — no Ask backend, provider
  // call, finance tool, or conversation persistence executes. The gate is
  // intentionally never removed; the interactive implementation stays intact
  // for future resumption behind this same switch.
  const showComingSoon = !isAskV2Enabled();

  await ensureOnboarding();

  const ctx = await requireAuthContext().catch(() => null);
  if (!ctx) redirect("/login");

  if (showComingSoon) {
    return (
      <AskComingSoon
        userName={ctx.user.name ?? undefined}
        userEmail={ctx.user.email}
        onSignOut={signOutAction}
      />
    );
  }

  return (
    <AskV2Chat
      userName={ctx.user.name ?? undefined}
      userEmail={ctx.user.email}
      businessName={ctx.business.name}
      currency={ctx.business.currency}
      onSignOut={signOutAction}
    />
  );
}