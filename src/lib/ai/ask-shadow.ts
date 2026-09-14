// ============================================================
// LedgerAI — Real LLM Shadow Integration (spec §13, Stage 3)
// ------------------------------------------------------------
// ASK_LLM_MODE=shadow runs the configured interpreter strictly as
// off-path telemetry: the deterministic answer is served first and
// never spliced, rejected, delayed, or annotated by anything here.
// Invariants held in this module:
//   - input is the SAME redacted interpreter surface the canary
//     would send (slot names + period kinds only);
//   - business/user/conversation ids, transactions, category and
//     account names, amounts, prior answers, prompts, raw model
//     output, and credentials are never logged or traced;
//   - transport failure, timeout, malformed JSON, schema failure,
//     policy rejection, and missing credentials all reduce to a
//     redacted trace and are never allowed to affect the response;
//   - the served answer is always the deterministic one.
// ============================================================

import { performance } from "node:perf_hooks";
import type { AskAiRuntime } from "@/lib/ai/ask-provider";
import type { FinancialContextFrame } from "@/lib/finance/context-frame";
import type { QuestionClassification } from "@/lib/finance/assistant";
import { buildInterpreterSurface } from "@/lib/ask/context-resolver";
import { buildInterpreterMessages } from "@/lib/ask/prompts/interpreter";
import { interpretationSchema } from "@/lib/ask/contracts";
import { evaluateInterpretationPolicy } from "@/lib/ask/policy";
import {
  createAskTrace,
  emitAskTrace,
  type AskTrace,
  type AskTracePolicyOutcome,
  type AskTraceProviderStatus,
} from "@/lib/observability/ask-trace";

/** Hard deadline for one shadow interpreter call (off-path, never awaited). */
export const SHADOW_INTERPRETER_TIMEOUT_MS = 8000;

export interface ShadowTelemetryInput {
  ai: AskAiRuntime;
  question: string;
  classification: QuestionClassification;
  traceId: string;
  now: Date;
  /** Ownership-checked, tenant-scoped frames; empty when no conversation. */
  loadFrames: () => Promise<FinancialContextFrame[]>;
}

/**
 * Fire-and-forget shadow evaluation. Gated on the provider being configured
 * and the server sample rate; if anything at all fails the served
 * deterministic answer is untouched.
 */
export function maybeShadowTelemetry(input: ShadowTelemetryInput): void {
  const { ai } = input;
  if (!ai.providers.interpreter.configured) return;
  if (ai.config.shadowSampleRate <= 0) return;
  if (Math.random() >= ai.config.shadowSampleRate) return;

  void (async () => {
    try {
      const frames = await input.loadFrames();
      const trace = await buildShadowTrace({
        ai,
        question: input.question,
        classification: input.classification,
        frames,
        traceId: input.traceId,
        now: input.now,
      });
      emitAskTrace(trace);
    } catch {
      // Shadow telemetry never affects the served answer.
    }
  })();
}

export interface BuildShadowTraceInput {
  ai: AskAiRuntime;
  question: string;
  classification: QuestionClassification;
  frames: FinancialContextFrame[];
  traceId: string;
  now: Date;
}

/**
 * Run one real interpreter call against the redacted surface and shape the
 * outcome into a fully redacted structured trace. Returns the trace so
 * callers can emit it (or tests can assert on it) without awaiting in the
 * request path.
 */
export async function buildShadowTrace(
  input: BuildShadowTraceInput,
): Promise<AskTrace> {
  const surface = buildInterpreterSurface(input.frames);
  const messages = buildInterpreterMessages({
    now: input.now,
    question: input.question,
    surface,
  });

  const started = performance.now();
  let raw: unknown;
  let providerStatus: AskTraceProviderStatus;
  try {
    raw = await input.ai.providers.interpreter.interpret(messages, {
      signal: AbortSignal.timeout(SHADOW_INTERPRETER_TIMEOUT_MS),
    });
    providerStatus = "ok";
  } catch (error) {
    providerStatus = isShadowAbort(error) ? "timeout" : "transport_error";
  }
  const providerLatency = Math.max(
    0,
    Math.round(performance.now() - started),
  );

  const parsed = interpretationSchema.safeParse(
    providerStatus === "ok" ? raw : null,
  );
  const disposition = parsed.success
    ? parsed.data.disposition
    : null;

  const policyDecision =
    parsed.success && disposition === "query"
      ? evaluateInterpretationPolicy(parsed.data, surface.availableReferenceSlots)
      : null;
  return createAskTrace({
    traceId: input.traceId,
    mode: "deterministic",
    deterministicDisposition: input.classification.kind,
    providerAttempted: true,
    providerOutcome: "not_used",
    providerStatus,
    schemaValid: parsed.success,
    policyOutcome: policyOutcome(disposition, policyDecision),
    contextResolution: "none",
    resultKind:
      input.classification.kind === "query"
        ? "answer"
        : input.classification.kind,
    latencyMs: {
      context: 0,
      provider: providerLatency,
      tools: 0,
      render: 0,
      total: providerLatency,
    },
    promptVersion: messages.promptVersion,
    provider: input.ai.providers.interpreter.name,
    model: input.ai.providers.interpreter.model ?? null,
  });
}

function policyOutcome(
  disposition: "query" | "clarify" | "unsupported" | null,
  decision: { allowed: boolean } | null,
): AskTracePolicyOutcome {
  if (disposition === "clarify") return "clarified";
  if (disposition === "query" && decision !== null) return "executed";
  return "unsupported";
}

/** Recognize both the Node TimeoutError and classic AbortError. */
function isShadowAbort(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  );
}