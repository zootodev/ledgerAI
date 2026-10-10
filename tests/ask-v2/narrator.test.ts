import { describe, expect, it, vi } from "vitest";
import { narrateAskV2 } from "@/lib/ask-v2/narrator";
import type { AskAiRuntime } from "@/lib/ai/ask-provider";
import type { AskTurnMessages } from "@/lib/ai/ask-provider";
import type { NarrationManifest } from "@/lib/ask/contracts";
import {
  ASK_V2_NARRATOR_PROMPT_VERSION,
  ASK_V2_NARRATOR_SYSTEM_PROMPT,
} from "@/lib/ask-v2/narrator-prompt";

const NOW = new Date("2026-08-15T12:00:00.000Z");

/** Verified fact manifest for "expenses in July 2026 was ₦187,600". */
const MANIFEST: NarrationManifest = {
  answerKind: "summary",
  facts: [
    { id: "F1", kind: "period", display: "July 2026", required: true },
    { id: "F2", kind: "money", display: "₦187,600", required: true },
  ],
  allowedTemplates: ["direct"],
};

const GROUNDED_ANSWER = { answer: "Your spending in July 2026 was ₦187,600." };

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
    interpret: vi.fn().mockResolvedValue(GROUNDED_ANSWER),
    ...overrides,
  };
}

function runtime(
  interpreter: InterpreterStub = interpreterStub(),
  mode: "off" | "shadow" | "canary" = "canary",
): AskAiRuntime {
  return {
    config: {
      mode,
      interpreterEnabled: true,
      narrationEnabled: false,
      structuredStateWrite: false,
      shadowSampleRate: 1,
      askV2Enabled: false,
      askEnabled: false,
    },
    providers: {
      interpreter: interpreter as never,
      narrationPlanner: { name: "deterministic", configured: false, plan: vi.fn() },
    },
  };
}

function providerPayloads(interpreter: InterpreterStub): AskTurnMessages {
  return interpreter.interpret.mock.calls[0][0] as AskTurnMessages;
}

const base = {
  userMessage: "What did I spend last month?",
  history: [],
  manifest: MANIFEST,
  deterministicText: "Spending in July 2026 was ₦187,600.",
  now: NOW,
};

describe("narrateAskV2 — grounded narration", () => {
  it("accepts a grounded narration and returns it as the served answer", async () => {
    const interpreter = interpreterStub();
    const result = await narrateAskV2({ ...base, ai: runtime(interpreter) });

    expect(result.kind).toBe("answer");
    if (result.kind === "answer") {
      expect(result.text).toBe("Your spending in July 2026 was ₦187,600.");
      expect(result.provider).toEqual({
        name: "fake-openai",
        configured: true,
        model: "gpt-fake-1",
        promptVersion: ASK_V2_NARRATOR_PROMPT_VERSION,
      });
    }
    expect(interpreter.interpret).toHaveBeenCalledTimes(1);
  });

  it("uses the version-pinned narrator prompt contract", async () => {
    const interpreter = interpreterStub();
    await narrateAskV2({ ...base, ai: runtime(interpreter) });
    const messages = providerPayloads(interpreter);
    expect(messages.promptVersion).toBe(ASK_V2_NARRATOR_PROMPT_VERSION);
    expect(messages.system).toContain("Use ONLY the verified facts provided");
    const payload = JSON.parse(messages.user) as Record<string, unknown>;
    expect(payload.outputSchema).toBe("narrationSchema");
    expect(payload.manifest).toEqual(MANIFEST);
    expect(payload.userMessage).toBe("What did I spend last month?");
    expect(payload.history).toEqual([]);
  });

  it("sends the narrator ONLY the purified payload — never ids, prisma, or SQL", async () => {
    const interpreter = interpreterStub();
    await narrateAskV2({ ...base, ai: runtime(interpreter) });
    const messages = providerPayloads(interpreter);
    expect(messages.user).not.toMatch(/prisma|SELECT|sql|businessId|userId|tenantId|createdAt|updatedAt/i);
    const payload = JSON.parse(messages.user) as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual(
      ["deterministicFallback", "history", "manifest", "outputSchema", "today", "userMessage"].sort(),
    );
  });
});

describe("narrateAskV2 — narrator prompt JSON output contract", () => {
  it("instructs the model to return a JSON object with exactly the answer field, while keeping the verified-facts rules", () => {
    expect(ASK_V2_NARRATOR_SYSTEM_PROMPT).toMatch(/json/i);
    expect(ASK_V2_NARRATOR_SYSTEM_PROMPT).toMatch(/\{"answer":/);
    expect(ASK_V2_NARRATOR_SYSTEM_PROMPT).toMatch(/no extra fields/);
    expect(ASK_V2_NARRATOR_SYSTEM_PROMPT).toContain("Use ONLY the verified facts provided");
    expect(ASK_V2_NARRATOR_SYSTEM_PROMPT).toContain("Never calculate, estimate, add");
  });
});

describe("narrateAskV2 — grounding rejects unverified claims", () => {
  it("rejects a narration that computes an unverified percentage", async () => {
    const interpreter = interpreterStub({
      interpret: vi.fn().mockResolvedValue({
        answer: "Your spending in July 2026 was ₦187,600 — 12% higher than last month.",
      }),
    });
    const result = await narrateAskV2({ ...base, ai: runtime(interpreter) });
    expect(result.kind).toBe("fallback");
    if (result.kind === "fallback") {
      expect(result.reason).toBe("not_grounded");
      expect(result.text).toBe("Spending in July 2026 was ₦187,600.");
    }
  });

  it("rejects a narration that invents a figure", async () => {
    const interpreter = interpreterStub({
      interpret: vi.fn().mockResolvedValue({
        answer: "Your spending in July 2026 was ₦200,000.",
      }),
    });
    const result = await narrateAskV2({ ...base, ai: runtime(interpreter) });
    expect(result.kind).toBe("fallback");
    if (result.kind === "fallback") expect(result.reason).toBe("not_grounded");
  });

  it("rejects a narration that invents a category name", async () => {
    const breakdownManifest: NarrationManifest = {
      answerKind: "breakdown",
      facts: [
        { id: "F1", kind: "period", display: "July 2026", required: true },
        { id: "F2", kind: "money", display: "₦120,000 total", required: true },
        { id: "F3", kind: "category", display: "Software", required: true },
        { id: "F4", kind: "money", display: "Software ₦60,000", required: true },
        { id: "F5", kind: "category", display: "Transport", required: true },
        { id: "F6", kind: "money", display: "Transport ₦60,000", required: true },
      ],
      allowedTemplates: ["direct", "brief", "ranked"],
    };
    const interpreter = interpreterStub({
      interpret: vi.fn().mockResolvedValue({
        answer:
          "Of your ₦120,000 spending in July 2026, Software took ₦60,000, Transport ₦60,000, and Office Chairs ₦50,000.",
      }),
    });
    const result = await narrateAskV2({
      ...base,
      manifest: breakdownManifest,
      deterministicText: "Software ₦60,000 and Transport ₦60,000.",
      ai: runtime(interpreter),
    });
    expect(result.kind).toBe("fallback");
    if (result.kind === "fallback") expect(result.reason).toBe("not_grounded");
  });
});

describe("narrateAskV2 — valid grounded formats", () => {
  // Equivalent currency forms must all ground (₦379,050 / ₦379050 / 379,050 / 379050).
  const forms = [
    "Your spending in July 2026 was ₦187,600.",
    "Your spending in July 2026 was 187600.",
    "Your spending in July 2026 was 187,600.",
  ];
  for (const sentence of forms) {
    it(`accepts grounded currency form: ${sentence}`, async () => {
      const interpreter = interpreterStub({
        interpret: vi.fn().mockResolvedValue({ answer: sentence }),
      });
      const result = await narrateAskV2({ ...base, ai: runtime(interpreter) });
      expect(result.kind).toBe("answer");
    });
  }
});

describe("narrateAskV2 — provider failure falls back, never fabricates", () => {
  it("falls back to deterministic text when no provider is wired", async () => {
    const interpreter = interpreterStub({ configured: false });
    const result = await narrateAskV2({ ...base, ai: runtime(interpreter) });
    expect(result.kind).toBe("fallback");
    if (result.kind === "fallback") {
      expect(result.reason).toBe("provider_unavailable");
      expect(result.text).toBe(base.deterministicText);
    }
    expect(interpreter.interpret).not.toHaveBeenCalled();
  });

  it("falls back when mode is off", async () => {
    const interpreter = interpreterStub();
    const result = await narrateAskV2({ ...base, ai: runtime(interpreter, "off") });
    expect(result.kind).toBe("fallback");
    if (result.kind === "fallback") expect(result.reason).toBe("provider_unavailable");
    expect(interpreter.interpret).not.toHaveBeenCalled();
  });

  it("maps a transport failure to provider_unavailable + deterministic fallback", async () => {
    const interpreter = interpreterStub({ interpret: vi.fn().mockRejectedValue(new Error("fetch failed")) });
    const result = await narrateAskV2({ ...base, ai: runtime(interpreter) });
    expect(result.kind).toBe("fallback");
    if (result.kind === "fallback") {
      expect(result.reason).toBe("provider_unavailable");
      expect(result.text).toBe(base.deterministicText);
    }
  });

  it("maps abort/timeout to provider_timeout + deterministic fallback", async () => {
    for (const name of ["TimeoutError", "AbortError"]) {
      const interpreter = interpreterStub({
        interpret: vi.fn().mockRejectedValue(Object.assign(new Error("deadline"), { name })),
      });
      const result = await narrateAskV2({ ...base, ai: runtime(interpreter) });
      expect(result.kind).toBe("fallback");
      if (result.kind === "fallback") expect(result.reason).toBe("provider_timeout");
    }
  });

  it("maps malformed output (non {answer}) to invalid_provider_output + fallback", async () => {
    for (const bad of [{ n: 5 }, { answer: "" }, "plain text", null]) {
      const interpreter = interpreterStub({ interpret: vi.fn().mockResolvedValue(bad) });
      const result = await narrateAskV2({ ...base, ai: runtime(interpreter) });
      expect(result.kind).toBe("fallback");
      if (result.kind === "fallback") {
        expect(result.reason).toBe("invalid_provider_output");
        expect(result.text).toBe(base.deterministicText);
      }
    }
  });

  it("the fallback text is ALWAYS the verified deterministic text — never LLM prose", async () => {
    const interpreter = interpreterStub({
      interpret: vi.fn().mockResolvedValue({ answer: "Not verified at all, ₦9,999." }),
    });
    const result = await narrateAskV2({ ...base, ai: runtime(interpreter) });
    expect(result.kind).toBe("fallback");
    if (result.kind === "fallback") {
      expect(result.reason).toBe("not_grounded");
      expect(result.text).toBe(base.deterministicText);
    }
  });
});

/* ------------------------------------------------------------
 * Phase 12 — manifest/grounding alignment
 * ------------------------------------------------------------ */

/** Expense summary WITH the certified prior-period delta the deterministic
 *  renderer displays (mirrors buildFactManifest after Phase 12). */
const DELTA_MANIFEST: NarrationManifest = {
  answerKind: "summary",
  facts: [
    { id: "F1", kind: "period", display: "August 2026", required: true },
    { id: "F2", kind: "money", display: "₦379,050", required: true },
    { id: "F3", kind: "relation", display: "prior July 2026: ₦413,300", required: true },
    { id: "F4", kind: "relation", display: "vs prior July 2026: -8%", required: false },
  ],
  allowedTemplates: ["direct", "brief", "explain"],
};

const DELTA_DETERMINISTIC_TEXT =
  "Spending in August 2026 was ₦379,050. That's -8% vs the prior period (₦379,050 now vs ₦413,300 before).";

describe("narrateAskV2 — Phase 12 verified delta narration", () => {
  it("accepts a narration that restates the verified prior-period delta", async () => {
    const sentence =
      "Your spending in August 2026 totaled ₦379,050, down 8% compared with July 2026's ₦413,300.";
    const interpreter = interpreterStub({
      interpret: vi.fn().mockResolvedValue({ answer: sentence }),
    });
    const result = await narrateAskV2({
      ...base,
      manifest: DELTA_MANIFEST,
      deterministicText: DELTA_DETERMINISTIC_TEXT,
      ai: runtime(interpreter),
    });
    expect(result.kind).toBe("answer");
    if (result.kind === "answer") expect(result.text).toBe(sentence);
  });

  it("grounds the deterministic fallback that carries the certified delta", async () => {
    const interpreter = interpreterStub({
      interpret: vi.fn().mockResolvedValue({ answer: DELTA_DETERMINISTIC_TEXT }),
    });
    const result = await narrateAskV2({
      ...base,
      manifest: DELTA_MANIFEST,
      deterministicText: DELTA_DETERMINISTIC_TEXT,
      ai: runtime(interpreter),
    });
    expect(result.kind).toBe("answer");
  });

  it("still falls back when a narration invents a derived percentage", async () => {
    const interpreter = interpreterStub({
      interpret: vi.fn().mockResolvedValue({
        answer:
          "Your spending in August 2026 totaled ₦379,050, up 42% compared with July 2026's ₦413,300.",
      }),
    });
    const result = await narrateAskV2({
      ...base,
      manifest: DELTA_MANIFEST,
      deterministicText: DELTA_DETERMINISTIC_TEXT,
      ai: runtime(interpreter),
    });
    expect(result.kind).toBe("fallback");
    if (result.kind === "fallback") {
      expect(result.reason).toBe("not_grounded");
      expect(result.text).toBe(DELTA_DETERMINISTIC_TEXT);
    }
  });
});

describe("narrateAskV2 — Phase 12 prompt contract", () => {
  it("G: tells the narrator that deterministicFallback is illustrative, not prescriptive", () => {
    expect(ASK_V2_NARRATOR_SYSTEM_PROMPT).toMatch(/illustrative, not\s+prescriptive/i);
    expect(ASK_V2_NARRATOR_SYSTEM_PROMPT).toMatch(/do not imitate its wording mechanically/i);
    expect(ASK_V2_NARRATOR_SYSTEM_PROMPT).toMatch(/prefer plain restatement of the\s+verified facts/i);
    expect(ASK_V2_NARRATOR_SYSTEM_PROMPT).toMatch(
      /unless the exact percentage is\s+represented in the verified facts/i,
    );
    expect(ASK_V2_NARRATOR_SYSTEM_PROMPT).toContain("Never calculate");
  });
});