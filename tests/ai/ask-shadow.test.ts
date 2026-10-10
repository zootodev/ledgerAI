import { describe, expect, it, vi, afterEach } from "vitest";
import {
  buildShadowTrace,
  maybeShadowTelemetry,
} from "@/lib/ai/ask-shadow";
import { interpretationSchema } from "@/lib/ask/contracts";
import { buildContextFrame, type FinancialContextFrame } from "@/lib/finance/context-frame";
import type { QuestionClassification } from "@/lib/finance/assistant";
import type { AskAiRuntime } from "@/lib/ai/ask-provider";
import { redactionViolations } from "@/lib/observability/ask-trace";

const NOW = new Date("2026-08-15T12:00:00.000Z");

const VALID_QUERY_JSON: unknown = interpretationSchema.parse({
  disposition: "query",
  intent: "expenses",
  period: { kind: "this_month" },
  entity: null,
  target: null,
  mode: "factual",
  operation: null,
  effectGoal: null,
  userAmountSpan: null,
  reference: "none",
  confidence: 0.85,
});

const QUERY_CLASSIFICATION: QuestionClassification = {
  kind: "query",
  query: { intent: "expenses", category: null, period: { kind: "thisMonth" } },
};
const CLARIFY_CLASSIFICATION: QuestionClassification = {
  kind: "clarification",
  reason: "ambiguous_amount",
};
const UNSUPPORTED_CLASSIFICATION: QuestionClassification = {
  kind: "unsupported",
};

interface InterpreterStub {
  name: string;
  configured: boolean;
  model: string | null;
  interpret: ReturnType<typeof vi.fn>;
}

function interpreterStub(overrides: Partial<InterpreterStub> = {}): InterpreterStub {
  return {
    name: "fake-openai",
    configured: true,
    model: "gpt-fake-1",
    interpret: vi.fn().mockResolvedValue(VALID_QUERY_JSON),
    ...overrides,
  };
}

function runtime(
  interpreter: InterpreterStub = interpreterStub(),
  shadowSampleRate = 1,
  mode: "off" | "shadow" | "canary" = "shadow",
): AskAiRuntime {
  return {
    config: {
      mode,
      interpreterEnabled: true,
      narrationEnabled: false,
      structuredStateWrite: false,
      shadowSampleRate,
      askV2Enabled: false,
      askEnabled: false,
    },
    providers: {
      interpreter: interpreter as never,
      narrationPlanner: { name: "deterministic", configured: false, plan: vi.fn() },
    },
  };
}

function sensitiveFrames(): FinancialContextFrame[] {
  return [
    buildContextFrame({
      conversationId: "conv-8888",
      businessId: "biz-7777",
      question: "How much did I spend in August?",
      answer: "You spent ₦600,000 in August, mainly on Transport and Rent.",
      createdAt: "2026-08-10T09:00:00.000Z",
      exchangeIndex: 0,
      now: NOW,
    }),
    buildContextFrame({
      conversationId: "conv-8888",
      businessId: "biz-7777",
      question: "What was my balance?",
      answer: "Your balance is ₦12,500,000.",
      createdAt: "2026-08-12T09:00:00.000Z",
      exchangeIndex: 1,
      now: NOW,
    }),
  ];
}

describe("buildShadowTrace", () => {
  it("captures a valid response as redacted, never-used telemetry", async () => {
    const trace = await buildShadowTrace({
      ai: runtime(),
      question: "How much did I spend last month?",
      classification: QUERY_CLASSIFICATION,
      frames: sensitiveFrames(),
      traceId: "t-1",
      now: NOW,
    });

    expect(trace.mode).toBe("deterministic");
    expect(trace.deterministicDisposition).toBe("query");
    expect(trace.resultKind).toBe("answer");
    expect(trace.providerAttempted).toBe(true);
    expect(trace.providerOutcome).toBe("not_used");
    expect(trace.providerStatus).toBe("ok");
    expect(trace.schemaValid).toBe(true);
    expect(trace.policyOutcome).toBe("executed");
    expect(trace.provider).toBe("fake-openai");
    expect(trace.model).toBe("gpt-fake-1");
    expect(trace.promptVersion).toMatch(/^ask-interpreter\//);
    expect(trace.latencyMs.total).toBeGreaterThanOrEqual(trace.latencyMs.provider);

    expect(redactionViolations(trace)).toEqual([]);
    const serialized = JSON.stringify(trace);
    expect(serialized).not.toContain("600,000");
    expect(serialized).not.toContain("12,500,000");
    expect(serialized).not.toContain("Transport");
    expect(serialized).not.toContain("conv-8888");
    expect(serialized).not.toContain("biz-7777");
    expect(serialized).not.toContain("How much did I spend");
  });

  it("maps clarification/unsupported classifications truthfully", async () => {
    const clarify = await buildShadowTrace({
      ai: runtime(),
      question: "How much?",
      classification: CLARIFY_CLASSIFICATION,
      frames: sensitiveFrames(),
      traceId: "t-2",
      now: NOW,
    });
    expect(clarify.deterministicDisposition).toBe("clarification");
    expect(clarify.resultKind).toBe("clarification");

    const unsupported = await buildShadowTrace({
      ai: runtime(),
      question: "What is the meaning of life?",
      classification: UNSUPPORTED_CLASSIFICATION,
      frames: [],
      traceId: "t-3",
      now: NOW,
    });
    expect(unsupported.deterministicDisposition).toBe("unsupported");
    expect(unsupported.resultKind).toBe("unsupported");
  });

  it("discards a malformed response without throwing", async () => {
    const interpret = vi.fn().mockResolvedValue({ junk: true });
    const trace = await buildShadowTrace({
      ai: runtime(interpreterStub({ interpret })),
      question: "How much did I spend?",
      classification: QUERY_CLASSIFICATION,
      frames: [],
      traceId: "t-4",
      now: NOW,
    });
    expect(trace.providerStatus).toBe("ok");
    expect(trace.schemaValid).toBe(false);
    expect(trace.policyOutcome).toBe("unsupported");
    expect(trace.deterministicDisposition).toBe("query");
  });

  it("records a transport error as redacted telemetry (never throws)", async () => {
    const interpret = vi.fn().mockRejectedValue(new Error("fetch failed"));
    const trace = await buildShadowTrace({
      ai: runtime(interpreterStub({ interpret })),
      question: "How much did I spend?",
      classification: UNSUPPORTED_CLASSIFICATION,
      frames: [],
      traceId: "t-5",
      now: NOW,
    });
    expect(trace.providerStatus).toBe("transport_error");
    expect(trace.schemaValid).toBe(false);
    expect(trace.resultKind).toBe("unsupported");
    expect(JSON.stringify(trace)).not.toContain("fetch failed");
  });

  it("records a timeout (AbortError) distinctly", async () => {
    const abort = new Error("The operation was aborted");
    abort.name = "AbortError";
    const interpret = vi.fn().mockRejectedValue(abort);
    const trace = await buildShadowTrace({
      ai: runtime(interpreterStub({ interpret })),
      question: "How much did I spend?",
      classification: QUERY_CLASSIFICATION,
      frames: [],
      traceId: "t-6",
      now: NOW,
    });
    expect(trace.providerStatus).toBe("timeout");
    expect(trace.resultKind).toBe("answer");
  });

  it("never forwards tenant ids, figures, or prior answers to the provider", async () => {
    const interpret = vi.fn().mockResolvedValue(VALID_QUERY_JSON);
    await buildShadowTrace({
      ai: runtime(interpreterStub({ interpret })),
      question: "How much did I spend last month?",
      classification: QUERY_CLASSIFICATION,
      frames: sensitiveFrames(),
      traceId: "t-7",
      now: NOW,
    });
    const [input] = interpret.mock.calls[0];
    const serialized = JSON.stringify(input);
    expect(serialized).not.toContain("600,000");
    expect(serialized).not.toContain("12,500,000");
    expect(serialized).not.toContain("Transport");
    expect(serialized).not.toContain("Rent");
    expect(serialized).not.toContain("conv-8888");
    expect(serialized).not.toContain("biz-7777");
    expect(serialized).not.toContain("you spent");
    expect(serialized).not.toContain("Your balance");
  });

  it("never lets raw model output reach the trace", async () => {
    const interpret = vi.fn().mockResolvedValue({
      ...(VALID_QUERY_JSON as object),
      userAmountSpan: "raw-model-response-canary-marker",
    });
    const trace = await buildShadowTrace({
      ai: runtime(interpreterStub({ interpret })),
      question: "How much did I spend?",
      classification: QUERY_CLASSIFICATION,
      frames: [],
      traceId: "t-8",
      now: NOW,
    });
    expect(trace.schemaValid).toBe(true);
    expect(JSON.stringify(trace)).not.toContain("canary-marker");
  });
});

describe("maybeShadowTelemetry (fire-and-forget)", () => {
  afterEach(() => {
    delete process.env.ASK_DEBUG;
    vi.restoreAllMocks();
  });

  it("does nothing when the interpreter is not configured", () => {
    const interpret = vi.fn();
    maybeShadowTelemetry({
      ai: runtime(interpreterStub({ configured: false, interpret })),
      question: "How much did I spend?",
      classification: UNSUPPORTED_CLASSIFICATION,
      traceId: "t",
      now: NOW,
      loadFrames: async () => [],
    });
    expect(interpret).not.toHaveBeenCalled();
  });

  it("does nothing when the sample rate is zero", () => {
    const interpret = vi.fn();
    maybeShadowTelemetry({
      ai: runtime(interpreterStub({ interpret }), 0),
      question: "How much did I spend?",
      classification: UNSUPPORTED_CLASSIFICATION,
      traceId: "t",
      now: NOW,
      loadFrames: async () => [],
    });
    expect(interpret).not.toHaveBeenCalled();
  });

  it("skips the sample when the random draw misses", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.9);
    const interpret = vi.fn();
    maybeShadowTelemetry({
      ai: runtime(interpreterStub({ interpret }), 0.5),
      question: "How much did I spend?",
      classification: UNSUPPORTED_CLASSIFICATION,
      traceId: "t",
      now: NOW,
      loadFrames: async () => [],
    });
    expect(interpret).not.toHaveBeenCalled();
  });

  it("invokes the real provider on a sample and emits a clean trace", async () => {
    process.env.ASK_DEBUG = "1";
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    const interpret = vi.fn().mockResolvedValue(VALID_QUERY_JSON);
    maybeShadowTelemetry({
      ai: runtime(interpreterStub({ interpret }), 0.5),
      question: "How much did I spend last month?",
      classification: QUERY_CLASSIFICATION,
      traceId: "trace-1",
      now: NOW,
      loadFrames: async () => sensitiveFrames(),
    });
    await vi.waitFor(() => expect(interpret).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(spy).toHaveBeenCalled());
    const emitted = spy.mock.calls[0][0] as string;
    expect(emitted).toContain("[ask-trace]");
    expect(emitted).toContain('"providerOutcome":"not_used"');
    expect(emitted).toContain('"providerStatus":"ok"');
    expect(emitted).toContain('"traceId":"trace-1"');
    expect(emitted).not.toContain("600,000");
    expect(emitted).not.toContain("conv-8888");
    expect(emitted).not.toContain("How much did I spend");
  });

  it("never breaks the caller when the context load fails", async () => {
    const interpret = vi.fn();
    maybeShadowTelemetry({
      ai: runtime(interpreterStub({ interpret }), 1),
      question: "How much did I spend?",
      classification: UNSUPPORTED_CLASSIFICATION,
      traceId: "t",
      now: NOW,
      loadFrames: async () => {
        throw new Error("context boom");
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(interpret).not.toHaveBeenCalled();
  });

  it("never runs in off mode", () => {
    const interpret = vi.fn();
    maybeShadowTelemetry({
      ai: runtime(interpreterStub({ interpret }), 1, "off"),
      question: "How much did I spend?",
      classification: UNSUPPORTED_CLASSIFICATION,
      traceId: "t",
      now: NOW,
      loadFrames: async () => [],
    });
    expect(interpret).not.toHaveBeenCalled();
  });
});