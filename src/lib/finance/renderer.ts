// ============================================================
// LedgerAI — answer renderer (Stage 2 narration seam)
// ------------------------------------------------------------
// The DEFAULT render is the deterministic narration produced by
// answerFromMetrics (identical offline and online). When narration is
// enabled AND the interpreter flowed to a canary answer, a validated
// narration plan may re-render the wording over the fact manifest. The
// gate is strict: the plan must parse, must use an allowlisted template,
// must not omit any fact the answer requires, and must not introduce any
// figure absent from the manifest. Any failed gate falls back to the
// deterministic text verbatim.
// ============================================================

import {
  narrationPlanSchema,
  type NarrationManifest,
  type NarrationPlan,
} from "@/lib/ask/contracts";
import { clarificationText, UNSUPPORTED_ANSWER } from "@/lib/finance/assistant";
import type { PlanOutcome } from "@/lib/finance/tools/executor";

/** Faithful default render for every plan outcome. */
export function deterministicText(outcome: PlanOutcome): string {
  if (outcome.kind === "answer") return outcome.answer.text;
  if (outcome.kind === "clarification") return clarificationText(outcome.reason);
  return UNSUPPORTED_ANSWER;
}

/** True when every required fact's figure/phrase is present, and the narration
 *  cites no figure that isn't in the manifest (the LLM must not invent). */
export function factCoverageOk(
  narration: string,
  manifest: NarrationManifest,
  plan: NarrationPlan,
): boolean {
  void plan;
  const text = narration.toLowerCase();
  const moneyLike = text.match(/[\d,.]+/g) ?? [];
  const numeric = (s: string) => s.replace(/[^\d]/g, "");

  // 1) Every required fact must be represented by its figure or phrase.
  for (const fact of manifest.facts) {
    if (!fact.required) continue;
    const digits = numeric(fact.display);
    if (digits.length === 0) {
      const phrase = fact.display.toLowerCase().replace(/[^a-z0-9 ]+/g, "");
      if (phrase.length > 0 && !text.includes(phrase)) return false;
      continue;
    }
    if (!moneyLike.some((t) => numeric(t) === digits)) return false;
  }

  // 2) Every figure the narration cites must be attributable to a manifest fact
  //    (the LLM may not invent or imply a number that is not verified).
  const allowed = new Set(
    manifest.facts.map((f) => numeric(f.display)).filter((d) => d.length > 0),
  );
  for (const token of moneyLike) {
    const d = numeric(token);
    if (d.length > 0 && !allowed.has(d)) return false;
  }
  return true;
}

/**
 * Apply a validated narration plan over the manifest. Returns the LLM wording
 * only when every gate passes; otherwise the deterministic text.
 */
export function renderWithNarrationPlan(
  defaultText: string,
  manifest: NarrationManifest | null,
  rawPlan: unknown,
  narration: string | null,
): string {
  if (!manifest || !narration || narration.trim().length === 0) return defaultText;
  if (typeof rawPlan !== "object" || rawPlan === null) return defaultText;

  const parsed = narrationPlanSchema.safeParse(rawPlan);
  if (!parsed.success) return defaultText;

  const plan = parsed.data;
  if (!manifest.allowedTemplates.includes(plan.template)) return defaultText;
  if (!factCoverageOk(narration, manifest, plan)) return defaultText;

  return narration.trim();
}

/** Parse + validate a narration plan if the pipeline supplied one. */
export function safelyParseNarrationPlan(raw: unknown): NarrationPlan | null {
  const parsed = narrationPlanSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}