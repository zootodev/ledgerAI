// ============================================================
// LedgerAI — narration planner prompt builder (Stage 5)
// ------------------------------------------------------------
// The presentation planner selects a template and orders ONLY supplied
// fact IDs (spec §5, §7). It is never a financial analyst and cannot
// author prose, values, dates, categories, or conclusions. The narration
// seam stays behind a disabled flag for the first production increment.
// ============================================================

import type { NarrationManifest, NarrationPlan } from "@/lib/ask/contracts";
import { NARRATION_PROMPT_VERSION } from "./versions";

export const NARRATION_SYSTEM_PROMPT = `Select one allowed template and order only supplied fact IDs. You are not a
financial analyst. Do not generate prose, values, dates, categories, claims,
recommendations, calculations, or facts. Return JSON only.`;

/** The default deterministic plan: direct template, canonical fact order. */
export function defaultNarrationPlan(manifest: NarrationManifest): NarrationPlan {
  return {
    template: (manifest.allowedTemplates.includes("direct") ? "direct" : manifest.allowedTemplates[0]),
    factOrder: manifest.facts.map((fact) => fact.id),
    optionalLead: "none",
  };
}

/** Versioned payload pushed to a narration planner provider. */
export function buildNarrationPayload(manifest: NarrationManifest): {
  system: string;
  manifest: NarrationManifest;
  promptVersion: string;
} {
  return {
    system: NARRATION_SYSTEM_PROMPT,
    manifest,
    promptVersion: NARRATION_PROMPT_VERSION,
  };
}