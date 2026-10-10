import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ensureOnboarding } from "@/lib/services/auth";
import { requireAuthContext } from "@/lib/services/auth-context";
import { listConversationsForContext } from "@/lib/services/assistant-conversations";
import { signOutAction } from "@/lib/auth/actions";
import { isAskEnabled } from "@/lib/ask/config";
import { AskShell } from "@/components/ask/ask-shell";
import { AskComingSoon } from "@/components/ask-v2/ask-coming-soon";

export const metadata: Metadata = {
  title: "Ask LedgerAI",
};

export default async function AskPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string | string[] }>;
}) {
  // Phase 28C: the v1 /ask surface is on hold. ASK_ENABLED (safe default
  // OFF) is the ONLY switch — while off, the user sees the presentation-only
  // "Coming Soon" state and no Ask backend, provider call, finance tool, or
  // conversation persistence executes. The interactive AskShell stays intact
  // for future resumption behind this same switch.
  const showComingSoon = !isAskEnabled();

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

  const params = await searchParams;
  const rawC = params.c;
  const initialConversationId =
    typeof rawC === "string" && rawC.length > 0 ? rawC : null;

  // Server-provided first paint: the client's first paint state (empty state
  // vs active chat) comes from the real, tenant-scoped list — fetched with the
  // already-resolved context so visiting /ask costs one conversation query and
  // zero unused conversation/message loads.
  const conversations = await listConversationsForContext(ctx.prisma, ctx.business.id);

  return (
    <AskShell
      userName={ctx.user.name ?? undefined}
      userEmail={ctx.user.email}
      businessName={ctx.business.name}
      currency={ctx.business.currency}
      onSignOut={signOutAction}
      conversations={conversations}
      initialConversationId={initialConversationId}
    />
  );
}