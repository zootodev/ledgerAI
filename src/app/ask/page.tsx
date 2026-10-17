import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ensureOnboarding } from "@/lib/services/auth";
import { requireAuthContext } from "@/lib/services/auth-context";

export const metadata: Metadata = {
  title: "Ask LedgerAI",
  // Hidden surface: keep it out of search indexes along with the 404.
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AskPage() {
  // Phase 5: the v1 Ask surface is no longer part of the product. Normal
  // auth protection runs first — unfinished profiles still bounce to
  // /onboarding and signed-out visitors to /login — then the route 404s so an
  // authenticated visit is never a silent redirect back to the app. The
  // deterministic Ask engine, services, and the ASK_ENABLED server gate remain
  // intact for a future resumption; only the product surface is hidden.
  await ensureOnboarding();
  const ctx = await requireAuthContext().catch(() => null);
  if (!ctx) redirect("/login");
  notFound();
}
