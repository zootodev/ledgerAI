import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ensureOnboarding } from "@/lib/services/auth";
import { requireAuthContext } from "@/lib/services/auth-context";
import { listConversationsForContext } from "@/lib/services/assistant-conversations";
import { signOutAction } from "@/lib/auth/actions";
import { AskShell } from "@/components/ask/ask-shell";

export const metadata: Metadata = {
  title: "Ask LedgerAI",
};

export default async function AskPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string | string[] }>;
}) {
  await ensureOnboarding();

  const [ctx, params] = await Promise.all([
    requireAuthContext().catch(() => null),
    searchParams,
  ]);
  if (!ctx) redirect("/login");

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