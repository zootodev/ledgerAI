import { describe, expect, it, vi, afterEach } from "vitest";
import {
  createAskV2Trace,
  emitAskV2Trace,
  type AskV2Trace,
} from "@/lib/observability/ask-v2-trace";
import { redactionViolations } from "@/lib/observability/ask-trace";

function fullV2Trace(): AskV2Trace {
  return createAskV2Trace({
    gate: "enabled",
    providerAttempted: true,
    providerOutcome: "accepted",
    providerStatus: "ok",
    provider: "openai",
    model: "gpt-oss-20b",
    interpreterPromptVersion: "ask-v2-interpreter/v7",
    narratorPromptVersion: "ask-v2-narrator/v1",
    policyDisposition: "executed",
    toolKeys: ["summary.get"],
    narrationKind: "narrated",
    narrationFallbackReason: null,
    groundingPassed: true,
    resultKind: "grounded_answer",
    latencyMs: { total: 512, interpreter: 300, narrator: 200 },
  });
}

describe("createAskV2Trace", () => {
  it("fills a fully-shaped redacted default when given nothing", () => {
    const trace = createAskV2Trace();
    expect(trace.event).toBe("ask-v2.turn.completed");
    expect(trace.surface).toBe("ask-v2");
    expect(trace.gate).toBe("enabled");
    expect(trace.providerAttempted).toBe(false);
    expect(trace.providerOutcome).toBe("not_used");
    expect(trace.providerStatus).toBe("not_attempted");
    expect(trace.policyDisposition).toBe("unsupported");
    expect(trace.narrationKind).toBe("not_attempted");
    expect(trace.narrationFallbackReason).toBeNull();
    expect(trace.groundingPassed).toBe(false);
    expect(trace.resultKind).toBe("unsupported");
    expect(trace.toolKeys).toEqual([]);
    expect(trace.traceId).toBeTruthy();
  });

  it("carries a trace id unique per trace", () => {
    expect(createAskV2Trace().traceId).not.toBe(createAskV2Trace().traceId);
  });
});

describe("ask-v2 trace redaction", () => {
  it("exposes only semantic keys — no ids, questions, or figures", () => {
    const trace: Record<string, unknown> = { ...fullV2Trace() };
    expect(trace.resultKind).toBe("grounded_answer");
    expect(trace.provider).toBe("openai");
    expect(trace.toolKeys).toEqual(["summary.get"]);
    expect(redactionViolations(trace)).toEqual([]);
  });

  it("rejects forbidden session/financial fields that must never be emitted", () => {
    const businessIdBad = { ...fullV2Trace(), businessId: "biz-1" } as unknown as AskV2Trace;
    const userIdBad = { ...fullV2Trace(), userId: "u-1" } as unknown as AskV2Trace;
    const conversationIdBad = { ...fullV2Trace(), conversationId: "c-1" } as unknown as AskV2Trace;
    const questionBad = { ...fullV2Trace(), question: "how much?" } as unknown as AskV2Trace;
    const rawOutputBad = { ...fullV2Trace(), rawOutput: { foo: 1 } } as unknown as AskV2Trace;
    const amountBad = { ...fullV2Trace(), amount: 5000 } as unknown as AskV2Trace;
    const categoryBad = { ...fullV2Trace(), category: "Rent" } as unknown as AskV2Trace;
    const transactionIdBad = { ...fullV2Trace(), transactionId: "tx-1" } as unknown as AskV2Trace;
    const apiKeyBad = { ...fullV2Trace(), apiKey: "sk-123" } as unknown as AskV2Trace;

    const violations = [
      redactionViolations(businessIdBad),
      redactionViolations(userIdBad),
      redactionViolations(conversationIdBad),
      redactionViolations(questionBad),
      redactionViolations(rawOutputBad),
      redactionViolations(amountBad),
      redactionViolations(categoryBad),
      redactionViolations(transactionIdBad),
      redactionViolations(apiKeyBad),
    ];
    for (const list of violations) {
      expect(list.length).toBeGreaterThan(0);
    }
  });

  it("represents provider/model/prompt metadata without any financial content", () => {
    const trace = fullV2Trace();
    expect(trace.provider).toBe("openai");
    expect(trace.model).toBe("gpt-oss-20b");
    expect(trace.interpreterPromptVersion).toBe("ask-v2-interpreter/v7");
    expect(trace.narratorPromptVersion).toBe("ask-v2-narrator/v1");
    // No money/category/transaction keys on the emitted payload.
    expect(redactionViolations(trace)).toEqual([]);
  });
});

describe("emitAskV2Trace", () => {
  afterEach(() => {
    delete process.env.ASK_DEBUG;
  });

  it("is silent unless ASK_DEBUG=1", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    emitAskV2Trace(fullV2Trace());
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("throws rather than emit a payload carrying a reserved key", () => {
    process.env.ASK_DEBUG = "1";
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const trace = { ...fullV2Trace(), conversationId: "c-1" } as unknown as AskV2Trace;
    expect(() => emitAskV2Trace(trace)).toThrow(/refusing to emit/);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("emits a JSON line when ASK_DEBUG=1 and the payload is clean", () => {
    process.env.ASK_DEBUG = "1";
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    emitAskV2Trace(fullV2Trace());
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("[ask-v2-trace]"));
    spy.mockRestore();
  });
});