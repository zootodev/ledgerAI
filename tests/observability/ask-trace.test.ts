import { describe, expect, it, vi, afterEach } from "vitest";
import {
  createAskTrace,
  emitAskTrace,
  newTraceId,
  redactionViolations,
  type AskTrace,
} from "@/lib/observability/ask-trace";

function fullTrace(): AskTrace {
  return createAskTrace({
    mode: "hybrid",
    deterministicDisposition: "query",
    providerAttempted: true,
    providerOutcome: "accepted",
    schemaValid: true,
    policyOutcome: "executed",
    toolKeys: ["summary.get"],
    contextResolution: "explicit_exact",
    resultKind: "answer",
    latencyMs: { context: 1, provider: 200, tools: 5, render: 1, total: 207 },
    promptVersion: "2026-08-v1",
    provider: "openai",
    model: "gpt-4o-mini",
  });
}

describe("createAskTrace", () => {
  it("fills a fully-shaped redacted default when given nothing", () => {
    const trace = createAskTrace();
    expect(trace.event).toBe("ask.turn.completed");
    expect(trace.mode).toBe("deterministic");
    expect(trace.providerAttempted).toBe(false);
    expect(trace.providerOutcome).toBe("not_used");
    expect(trace.traceId).toBeTruthy();
  });

  it("propagates only semantic keys (no question, ids, or figures)", () => {
    const trace = fullTrace();
    const keys = new Set(
      JSON.parse(JSON.stringify(trace)).object === undefined
        ? Object.keys(trace)
        : [],
    );
    expect(keys).toContain("resultKind");
    expect(keys).toContain("toolKeys");
    expect(keys).not.toContain("question");
    expect(keys).not.toContain("businessId");
    expect(keys).not.toContain("amount");
  });
});

describe("redactionViolations", () => {
  it("flags financial/session keys anywhere in a payload", () => {
    expect(redactionViolations({ foo: { businessId: "b" } })).toEqual(["businessId"]);
    expect(redactionViolations({ question: "how much?" })).toEqual(["question"]);
    expect(redactionViolations([{ amount: 5 }])).toEqual(["amount"]);
    expect(redactionViolations({ provider: "openai", toolKeys: ["a"] })).toEqual([]);
    expect(redactionViolations(null)).toEqual([]);
  });

  it("flags numbers exactly like the reserved key names (income, expenses, balance)", () => {
    expect(redactionViolations({ income: 1 })).toEqual(["income"]);
    expect(redactionViolations({ netProfit: 1_000 })).toEqual(["netProfit"]);
  });
});

describe("emitAskTrace", () => {
  afterEach(() => {
    delete process.env.ASK_DEBUG;
  });

  it("is silent unless ASK_DEBUG=1", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    emitAskTrace(fullTrace());
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("throws rather than emit a payload carrying a reserved key", () => {
    process.env.ASK_DEBUG = "1";
    const trace: AskTrace = {
      ...fullTrace(),
      question: "how much?",
    } as unknown as AskTrace;
    expect(() => emitAskTrace(trace)).toThrow(/refusing to emit/);
  });

  it("emits a JSON line when ASK_DEBUG=1 and the payload is clean", () => {
    process.env.ASK_DEBUG = "1";
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    emitAskTrace(fullTrace());
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("[ask-trace]"));
    spy.mockRestore();
  });
});

describe("newTraceId", () => {
  it("produces unique ids per call", () => {
    expect(newTraceId()).not.toBe(newTraceId());
  });
});