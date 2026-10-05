// ============================================================
// LedgerAI — Ask v2 trace (redacted, Phase 18C B-1)
// ------------------------------------------------------------
// One structured trace per /ask-v2 turn, at the server-action
// orchestration boundary. Mirrors the v1 `ask-trace` architecture
// (semantic keys + counts only, ASK_DEBUG=1 gated emission, hard
// redaction boundary) but is a narrowly scoped sibling type: the v2
// turn has narration/grounding concepts (narrator prompt version,
// grounding outcome, fallback reason) that do not exist on the v1
// AskTrace, so mixing them into v1 would couple unrelated flows.
//
// Never logged here:
//   businessId, userId, conversationId, transaction/account/DB ids,
//   tenant ids, raw user question, raw history, raw model output,
//   monetary amounts, category names, transaction data, API keys,
//   authorization headers, provider request/response bodies.
// ============================================================

import { newTraceId, redactionViolations } from "./ask-trace";

export type AskV2TraceProviderOutcome = "accepted" | "fallback" | "not_used";
export type AskV2TraceProviderStatus =
  | "ok"
  | "transport_error"
  | "timeout"
  | "not_attempted";
export type AskV2TracePolicyDisposition = "executed" | "clarified" | "unsupported";
export type AskV2TraceNarrationKind = "narrated" | "fallback" | "not_attempted";
export type AskV2TraceNarrationFallbackReason =
  | "provider_unavailable"
  | "provider_timeout"
  | "invalid_provider_output"
  | "not_grounded"
  | null;
export type AskV2TraceResultKind =
  | "grounded_answer"
  | "narration_fallback"
  | "answer"
  | "clarification"
  | "unsupported"
  | "provider_unavailable"
  | "provider_timeout"
  | "invalid_provider_output"
  | "execution_error";

export interface AskV2TraceLatency {
  total: number;
  interpreter: number;
  narrator: number;
}

export interface AskV2Trace {
  event: "ask-v2.turn.completed";
  surface: "ask-v2";
  traceId: string;
  gate: "enabled" | "disabled";
  providerAttempted: boolean;
  providerOutcome: AskV2TraceProviderOutcome;
  providerStatus: AskV2TraceProviderStatus;
  provider: string | null;
  model: string | null;
  interpreterPromptVersion: string | null;
  narratorPromptVersion: string | null;
  policyDisposition: AskV2TracePolicyDisposition;
  toolKeys: string[];
  narrationKind: AskV2TraceNarrationKind;
  narrationFallbackReason: AskV2TraceNarrationFallbackReason;
  groundingPassed: boolean;
  resultKind: AskV2TraceResultKind;
  latencyMs: AskV2TraceLatency;
}

/** Build a fully-shaped default v2 trace (fields filled by the action). */
export function createAskV2Trace(partial: Partial<AskV2Trace> = {}): AskV2Trace {
  return {
    event: "ask-v2.turn.completed",
    surface: "ask-v2",
    traceId: newTraceId(),
    gate: "enabled",
    providerAttempted: false,
    providerOutcome: "not_used",
    providerStatus: "not_attempted",
    provider: null,
    model: null,
    interpreterPromptVersion: null,
    narratorPromptVersion: null,
    policyDisposition: "unsupported",
    toolKeys: [],
    narrationKind: "not_attempted",
    narrationFallbackReason: null,
    groundingPassed: false,
    resultKind: "unsupported",
    latencyMs: { total: 0, interpreter: 0, narrator: 0 },
    ...partial,
  };
}

/** Emit a v2 trace line when `ASK_DEBUG=1`; the payload stays redacted. */
export function emitAskV2Trace(trace: AskV2Trace): void {
  if (process.env.ASK_DEBUG !== "1") return;
  const violations = redactionViolations(trace);
  if (violations.length > 0) {
    // A programming bug reached the emission boundary — never emit it.
    throw new Error(`ask-v2-trace: refusing to emit redacted keys ${violations.join(",")}`);
  }
  console.error(`[ask-v2-trace] ${JSON.stringify(trace)}`);
}