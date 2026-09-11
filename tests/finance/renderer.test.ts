import { describe, expect, it } from "vitest";
import {
  deterministicText,
  factCoverageOk,
  renderWithNarrationPlan,
  safelyParseNarrationPlan,
} from "@/lib/finance/renderer";
import type { NarrationManifest, NarrationPlan } from "@/lib/ask/contracts";
import type { PlanOutcome } from "@/lib/finance/tools/executor";

function summaryManifest(): NarrationManifest {
  return {
    answerKind: "summary",
    facts: [
      { id: "F1", kind: "period", display: "August 2026", required: true },
      { id: "F2", kind: "money", display: "₦600,000", required: true },
    ],
    allowedTemplates: ["direct", "brief", "explain"],
  };
}

function plan(overrides: Partial<NarrationPlan> = {}): NarrationPlan {
  return { template: "direct", factOrder: ["F1", "F2"], optionalLead: "none", ...overrides };
}

function answerOutcome(): PlanOutcome {
  return {
    kind: "answer",
    query: { intent: "expenses", category: null, period: { kind: "thisMonth" } },
    answer: { kind: "answer", text: "Spending in August 2026 was ₦600,000.", data: {} },
    metrics: {} as never,
    toolResults: {},
  };
}

describe("deterministicText", () => {
  it("returns the deterministic narration verbatim for answers, payments and unsupported", () => {
    const outcome = answerOutcome();
    expect(deterministicText(outcome)).toBe("Spending in August 2026 was ₦600,000.");
    expect(deterministicText({ kind: "clarification", reason: "needs_subject" })).toMatch(/clar/i);
    expect(deterministicText({ kind: "unsupported" })).toBeTruthy();
  });
});

describe("factCoverageOk", () => {
  it("accepts wording that cites every required figure", () => {
    expect(factCoverageOk("In August 2026 you spent ₦600,000.", summaryManifest(), plan())).toBe(true);
  });

  it("rejects narration that omits a required figure (LLM cannot drop a number)", () => {
    expect(factCoverageOk("You did great this month.", summaryManifest(), plan())).toBe(false);
    expect(factCoverageOk("Spending in August 2026 was solid.", summaryManifest(), plan())).toBe(false);
  });

  it("permits a fluctuated amount when the plan references a fact id", () => {
    // The gate is id-referenced OR numeric-match — the LLM may re-word.
    const referenced = plan({ factOrder: ["F1", "F2"] });
    expect(factCoverageOk("In August 2026 your outlay was ₦600,000 flat.", summaryManifest(), referenced)).toBe(true);
  });
});

describe("renderWithNarrationPlan", () => {
  const DEFAULT = "Spending in August 2026 was ₦600,000.";

  it("returns the LLM wording when every gate passes", () => {
    const rendered = renderWithNarrationPlan(
      DEFAULT,
      summaryManifest(),
      plan({ template: "brief" }),
      "In August 2026 you spent ₦600,000.",
    );
    expect(rendered).toBe("In August 2026 you spent ₦600,000.");
  });

  it("falls back to the deterministic text on any gate failure", () => {
    const manifest = summaryManifest();
    expect(renderWithNarrationPlan(DEFAULT, manifest, plan({ template: "ranked" }), "In August you spent ₦600,000.")).toBe(DEFAULT);
    expect(renderWithNarrationPlan(DEFAULT, manifest, { template: "direct" }, "In August you spent ₦600,000.")).toBe(DEFAULT);
    expect(renderWithNarrationPlan(DEFAULT, manifest, plan(), "You had a lovely month.")).toBe(DEFAULT);
    expect(renderWithNarrationPlan(DEFAULT, null, plan(), "In August you spent ₦600,000.")).toBe(DEFAULT);
    expect(renderWithNarrationPlan(DEFAULT, manifest, plan(), null)).toBe(DEFAULT);
  });

  it("never lets a plan carry a figure the manifest didn't verify", () => {
    // F2 is "₦600,000"; narration born from the manifest may cite only it.
    const invented = renderWithNarrationPlan(
      DEFAULT,
      summaryManifest(),
      plan(),
      "In August you spent ₦600,000 and saved ₦50,000.",
    );
    // The extra ₦50,000 is absent from the manifest → gate fails → deterministic.
    expect(invented).toBe(DEFAULT);
  });
});

describe("safelyParseNarrationPlan", () => {
  it("parses a valid plan and rejects noise", () => {
    expect(safelyParseNarrationPlan(plan())?.template).toBe("direct");
    expect(safelyParseNarrationPlan({ template: "ranked" })).toBeNull();
    expect(safelyParseNarrationPlan(null)).toBeNull();
  });
});