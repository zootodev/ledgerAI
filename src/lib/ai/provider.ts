// ============================================================
// AI Provider abstraction
// ------------------------------------------------------------
// A provider wraps a Categorizer (and optionally insight/assistant
// generators). The MVP ships only the deterministic rules provider so
// the app runs with no API key. When a real LLM is added, implement a
// provider that satisfies the same interfaces and select it here based
// on AI_PROVIDER. As configured values change the selection logic below,
// this is the single swap point.
// ============================================================

import type { AIService, Categorizer } from "./types";
import { RulesCategorizer } from "./rules-categorizer";

export type AiProviderName = "rules" | string;

/** Returns the active AI service. Defaults to the deterministic rules engine. */
export function getAIService(): AIService {
  const configured = process.env.AI_PROVIDER?.toLowerCase();
  const providerName: AiProviderName = configured && configured !== "" ? configured : "rules";

  const categorizer = createCategorizer(providerName);
  return { categorizer };
}

function createCategorizer(providerName: AiProviderName): Categorizer {
  switch (providerName) {
    case "rules":
      return new RulesCategorizer();
    // Future providers (e.g. "openai", "anthropic", "openrouter") implement
    // the Categorizer interface and are selected here. Without a real key/impl
    // they are intentionally not wired yet; the app always falls back to rules.
    default:
      return new RulesCategorizer();
  }
}
