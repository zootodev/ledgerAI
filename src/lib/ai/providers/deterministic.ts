// ============================================================
// LedgerAI — deterministic ask providers (default, offline parity)
// ------------------------------------------------------------
// The built-in providers are the permanent outage/offline fallback:
// the interpreter never fabricates a meaning (it reports
// `unsupported` with zero confidence, so the deterministic result
// always wins), and the narration planner yields the canonical
// default plan. `configured` is false so the pipeline can tell an
// explicitly-wired AI provider from this fallback.
// ============================================================

import {
  type AskInterpreterProvider,
  type AskTurnMessages,
  type NarrationPlannerProvider,
  type NarrationPlannerInput,
  type AskProviderOptions,
} from "@/lib/ai/ask-provider";
import { defaultNarrationPlan } from "@/lib/ask/prompts/narration";
import {
  narrationManifestSchema,
  type NarrationManifest,
} from "@/lib/ask/contracts";

/** Never displaces the deterministic result; always yields control back. */
export class DeterministicInterpreter implements AskInterpreterProvider {
  readonly name = "deterministic";
  readonly configured = false;

  async interpret(_input: AskTurnMessages, _options: AskProviderOptions): Promise<unknown> {
    void _input;
    void _options;
    return {
      disposition: "unsupported",
      safeReason: "not_supported",
      confidence: 0,
    };
  }
}

/** Produces the canonical direct plan; narration stays deterministic. */
export class DeterministicNarrationPlanner implements NarrationPlannerProvider {
  readonly name = "deterministic";
  readonly configured = false;

  async plan(input: NarrationPlannerInput, _options: AskProviderOptions): Promise<unknown> {
    void _options;
    const parsed = narrationManifestSchema.safeParse(input.manifest);
    if (!parsed.success) return null;
    return defaultNarrationPlan(parsed.data as NarrationManifest);
  }
}