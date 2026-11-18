import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ensureOnboarding } from "@/lib/services/auth";
import { requireAuthContext } from "@/lib/services/auth-context";

export const metadata: Metadata = {
  // Ask is opt-in and disabled by default; when off the surface 404s with a
  // title that matches the global 404 page so bookmarks don't show a mismatched
  // product name in browser tabs.
  title: "Page not found | LedgerAI",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AskPage() {
  // Phase 5: the v1 Ask surface is no longer part of the product. Normal
  // auth protection runs first — unfinished profiles still bounce to
  // /onboarding and signed-out visitors to /login. When Ask is gated off
  // (ASK_V2_ENABLED=false) the route 404s immediately so an authenticated
  // visit is never a silent redirect back to the app. The deterministic Ask
  // engine, services, and the server gate remain intact for a future
  // resumption; only the product surface is hidden.
  await ensureOnboarding();
  const ctx = await requireAuthContext().catch(() => null);
  if (!ctx) redirect("/login");
  // When Ask is explicitly disabled, 404 so the browser tab title matches
  // the global 404 page rather than persisting "Ask LedgerAI".
  notFound();
}
