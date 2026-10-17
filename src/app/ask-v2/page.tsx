import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ensureOnboarding } from "@/lib/services/auth";
import { requireAuthContext } from "@/lib/services/auth-context";

export const metadata: Metadata = {
  title: "Ask LedgerAI",
  // Hidden surface: keep it out of search indexes even along the redirect.
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AskV2Page() {
  // Phase 5: Ask is no longer a visible product surface. Normal auth
  // protection runs first — unfinished profiles still bounce to /onboarding
  // and signed-out visitors to /login — then every authenticated visit is
  // routed back to the app. The gated implementation (chat shell, actions,
  // ASK_V2_ENABLED server gate) stays intact for a future resumption behind
  // the same switch; only the product surface is hidden.
  await ensureOnboarding();
  const ctx = await requireAuthContext().catch(() => null);
  if (!ctx) redirect("/login");
  redirect("/overview");
}
