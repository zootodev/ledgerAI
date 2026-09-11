// ============================================================
// LedgerAI — Ask trace (redacted, spec §10)
// ------------------------------------------------------------
// One structured trace per turn with semantic keys and counts ONLY.
// Question/answer text, raw transactions, category names, money
// values, conversation/business/user ids, credentials, prompts, and
// raw model output are never logged. `ASK_DEBUG=1` (server-only)
// evolves the old ad-hoc follow-up trace into this structured form.
// ============================================================

import { randomUUID } from "node:crypto";

export type AskTraceMode = "deterministic" | "hybrid";
export type AskTraceProviderOutcome = "accepted" | "fallback" | "not_used";
export type AskTracePolicyOutcome = "executed" | "clarified" | "unsupported";
export type AskTraceContextResolution =
  | "explicit_exact"
  | "semantic_relationship"
  | "continuity"
  | "none"
  | "ambiguous_amount";

export interface AskTraceLatency {
  context: number;
  provider: number;
  tools: number;
  render: number;
  total: number;
}

export interface AskTrace {
  event: "ask.turn.completed";
  traceId: string;
  mode: AskTraceMode;
  deterministicDisposition: "query" | "clarification" | "unsupported";
  providerAttempted: boolean;
  providerOutcome: AskTraceProviderOutcome;
  schemaValid: boolean;
  policyOutcome: AskTracePolicyOutcome;
  toolKeys: string[];
  contextResolution: AskTraceContextResolution;
  resultKind: "answer" | "clarification" | "unsupported";
  latencyMs: AskTraceLatency;
  promptVersion: string | null;
  provider: string | null;
  model: string | null;
}

export function newTraceId(): string {
  return randomUUID();
}

const EMPTY_LATENCY: AskTraceLatency = {
  context: 0,
  provider: 0,
  tools: 0,
  render: 0,
  total: 0,
};

/** Build a fully-shaped default trace (fields filled by the service). */
export function createAskTrace(partial: Partial<AskTrace> = {}): AskTrace {
  return {
    event: "ask.turn.completed",
    traceId: newTraceId(),
    mode: "deterministic",
    deterministicDisposition: "unsupported",
    providerAttempted: false,
    providerOutcome: "not_used",
    schemaValid: true,
    policyOutcome: "unsupported",
    toolKeys: [],
    contextResolution: "none",
    resultKind: "unsupported",
    latencyMs: EMPTY_LATENCY,
    promptVersion: null,
    provider: null,
    model: null,
    ...partial,
  };
}

/** Freely-redacted trace serialize: never include these exact keys. */
const FORBIDDEN_KEYS = [
  "conversationId",
  "businessId",
  "userId",
  "question",
  "answer",
  "categoryName",
  "amount",
  "income",
  "expenses",
  "netProfit",
  "balance",
  "revenue",
  "prompt",
  "rawOutput",
];

/**
 * Assert a trace payload contains no forbidden financial/session values.
 * Returns the offending keys (empty = clean); used by negative tests and at
 * the emission boundary as a last-line filter.
 */
export function redactionViolations(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  return FORBIDDEN_KEYS.filter((key) => ownKey(value, key));
}

function ownKey(value: unknown, key: string): boolean {
  if (typeof value !== "object") return false;
  if (value === null) return false;
  if (Array.isArray(value)) return value.some((item) => ownKey(item, key));
  const record = value as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(record, key)) return true;
  return Object.values(record).some((item) => ownKey(item, key));
}

/** Emit a trace line when `ASK_DEBUG=1`; the payload itself stays redacted. */
export function emitAskTrace(trace: AskTrace): void {
  if (process.env.ASK_DEBUG !== "1") return;
  const violations = redactionViolations(trace);
  if (violations.length > 0) {
    // A programming bug reached the emission boundary — never emit it.
    throw new Error(`ask-trace: refusing to emit redacted keys ${violations.join(",")}`);
  }
  console.error(`[ask-trace] ${JSON.stringify(trace)}`);
}