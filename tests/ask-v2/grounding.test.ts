import { describe, expect, it } from "vitest";
import { isNarrationGrounded } from "@/lib/ask-v2/grounding";
import type { NarrationManifest } from "@/lib/ask/contracts";

/** Summary answer: July 2026 expenses ₦187,600 (with prior June ₦170,000). */
const SUMMARY_MANIFEST: NarrationManifest = {
  answerKind: "summary",
  facts: [
    { id: "F1", kind: "period", display: "July 2026", required: true },
    { id: "F2", kind: "money", display: "₦187,600", required: true },
    { id: "F3", kind: "relation", display: "prior June 2026: ₦170,000", required: true },
  ],
  allowedTemplates: ["direct"],
};

/** Breakdown answer: total + two verified categories. */
const BREAKDOWN_MANIFEST: NarrationManifest = {
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

const fullSummary = (mainFigure: string, priorFigure: string) =>
  `Your spending in July 2026 was ${mainFigure}, compared to ${priorFigure} in June 2026.`;

describe("isNarrationGrounded — figures", () => {
  it("accepts a narration that cites only verified figures", () => {
    expect(
      isNarrationGrounded(
        fullSummary("₦187,600", "₦170,000"),
        SUMMARY_MANIFEST,
      ),
    ).toEqual({ ok: true });
  });

  it("rejects an invented amount", () => {
    expect(
      isNarrationGrounded(
        fullSummary("₦300,000", "₦170,000"),
        SUMMARY_MANIFEST,
      ),
    ).toEqual({ ok: false, reason: "unsupported_figure_or_coverage" });
  });

  it("rejects a computed percentage that is not a verified figure", () => {
    expect(
      isNarrationGrounded(
        "Your spending in July 2026 was ₦187,600, compared to ₦170,000 in June — up 12%.",
        SUMMARY_MANIFEST,
      ),
    ).toEqual({ ok: false, reason: "unsupported_figure_or_coverage" });
  });

  it("rejects a narration that omits a required fact", () => {
    expect(
      isNarrationGrounded(
        "In July 2026 your spending was comfortably lower than June.",
        SUMMARY_MANIFEST,
      ),
    ).toEqual({ ok: false, reason: "unsupported_figure_or_coverage" });
  });

  it("accepts equivalent currency forms (₦187,600 / 187600 / 187,600)", () => {
    for (const form of [
      fullSummary("₦187,600", "₦170,000"),
      fullSummary("187600", "170000"),
      fullSummary("187,600", "170,000"),
    ]) {
      expect(isNarrationGrounded(form, SUMMARY_MANIFEST)).toEqual({ ok: true });
    }
  });
});

describe("isNarrationGrounded — required-fact coverage", () => {
  it("accepts a breakdown narration that cites every required figure", () => {
    expect(
      isNarrationGrounded(
        "Of your ₦120,000 spending in July 2026, Software took ₦60,000 and Transport took ₦60,000.",
        BREAKDOWN_MANIFEST,
      ),
    ).toEqual({ ok: true });
  });

  it("rejects a breakdown narration that omits a required category", () => {
    expect(
      isNarrationGrounded(
        "Of your ₦120,000 spending in July 2026, Software took ₦60,000.",
        BREAKDOWN_MANIFEST,
      ),
    ).toEqual({ ok: false, reason: "unsupported_figure_or_coverage" });
  });
});

describe("isNarrationGrounded — categories", () => {
  it("accepts verified category names", () => {
    expect(
      isNarrationGrounded(
        "In July 2026 your spending of ₦120,000 was Software at ₦60,000 and Transport at ₦60,000.",
        BREAKDOWN_MANIFEST,
      ),
    ).toEqual({ ok: true });
  });

  it("rejects a narration that invents a category name", () => {
    expect(
      isNarrationGrounded(
        "Of your ₦120,000 spending in July 2026, Software took ₦60,000, Transport took ₦60,000, and salestream took the rest.",
        BREAKDOWN_MANIFEST,
      ),
    ).toEqual({ ok: false, reason: "unsupported_category" });
  });
});

describe("isNarrationGrounded — periods", () => {
  it("accepts a narration citing only the verified period", () => {
    expect(
      isNarrationGrounded(
        fullSummary("₦187,600", "₦170,000"),
        SUMMARY_MANIFEST,
      ),
    ).toEqual({ ok: true });
  });

  it("rejects a narration citing an unverified month", () => {
    expect(
      isNarrationGrounded(
        "Your spending in July 2026 was ₦187,600, compared to ₦170,000 in January 2026.",
        SUMMARY_MANIFEST,
      ),
    ).toEqual({ ok: false, reason: "unsupported_period" });
  });

  it("allows the relation period referenced by a verified fact", () => {
    expect(
      isNarrationGrounded(
        "Your spending in July 2026 was ₦187,600, compared to ₦170,000 in June.",
        SUMMARY_MANIFEST,
      ),
    ).toEqual({ ok: true });
  });
});

describe("isNarrationGrounded — edge cases", () => {
  it("rejects empty narration", () => {
    expect(isNarrationGrounded("   ", SUMMARY_MANIFEST)).toEqual({
      ok: false,
      reason: "empty_narration",
    });
  });

  it("never performs arithmetic validation (pure set membership)", () => {
    // ₦60,000 + ₦60,000 = ₦120,000 matches the total — but grounding does not
    // verify the math; it only checks every cited figure is a verified fact.
    const result = isNarrationGrounded(
      "In July 2026, Software took ₦60,000, Transport took ₦60,000, and together they made up the ₦120,000 total.",
      BREAKDOWN_MANIFEST,
    );
    expect(result.ok).toBe(true);
  });
});

/* ------------------------------------------------------------
 * Phase 12 — manifest/grounding alignment (root cause: the deterministic
 * fallback could carry a certified prior-period delta the manifest did not
 * represent; common prose words were missing from PROSE_WORDS).
 * ------------------------------------------------------------ */

/** Expense summary WITH the certified prior-period delta ("-8%") that the
 *  deterministic renderer (deltaTail) legitimately displays. */
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

/** The exact deterministic fallback sentence for the delta manifest. */
const DELTA_DETERMINISTIC_TEXT =
  "Spending in August 2026 was ₦379,050. That's -8% vs the prior period (₦379,050 now vs ₦413,300 before).";

/** Spending distribution matching buildFactManifest's spendingDistribution. */
const DISTRIBUTION_MANIFEST: NarrationManifest = {
  answerKind: "breakdown",
  facts: [
    { id: "F1", kind: "period", display: "2026", required: true },
    { id: "F2", kind: "money", display: "₦1,229,600 total", required: true },
    { id: "F3", kind: "category", display: "Inventory", required: true },
    { id: "F4", kind: "percent", display: "34%", required: false },
    { id: "F5", kind: "category", display: "Rent", required: true },
    { id: "F6", kind: "percent", display: "29%", required: false },
    { id: "F7", kind: "category", display: "Salaries", required: true },
    { id: "F8", kind: "percent", display: "16%", required: false },
    { id: "F9", kind: "category", display: "Equipment", required: true },
    { id: "F10", kind: "percent", display: "6%", required: false },
    { id: "F11", kind: "category", display: "Marketing", required: true },
    { id: "F12", kind: "percent", display: "5%", required: false },
  ],
  allowedTemplates: ["direct", "brief", "ranked"],
};

/** The exact deterministic spending-distribution fallback sentence. */
const DISTRIBUTION_DETERMINISTIC_TEXT =
  "In 2026 your spending broke down as Inventory (34%), Rent (29%), Salaries (16%), Equipment (6%) and Marketing (5%). 6 more categories make up the rest of the ₦1,229,600 total.";

describe("isNarrationGrounded — Phase 12 verified delta alignment", () => {
  it("A: the deterministic fallback containing the certified delta is internally groundable", () => {
    expect(isNarrationGrounded(DELTA_DETERMINISTIC_TEXT, DELTA_MANIFEST)).toEqual({ ok: true });
  });

  it("B: a plain narration citing the verified delta is accepted", () => {
    expect(
      isNarrationGrounded(
        "Your spending in August 2026 totaled ₦379,050, down 8% compared with July 2026's ₦413,300.",
        DELTA_MANIFEST,
      ),
    ).toEqual({ ok: true });
  });

  it("D: a percentage NOT represented in the manifest still fails", () => {
    expect(
      isNarrationGrounded(
        "Your spending in August 2026 totaled ₦379,050, down 9% compared with July 2026's ₦413,300.",
        DELTA_MANIFEST,
      ),
    ).toEqual({ ok: false, reason: "unsupported_figure_or_coverage" });
  });

  it("F: an unverified period still fails even when comparison prose is allowed", () => {
    expect(
      isNarrationGrounded(
        "Spending in August 2026 was ₦379,050. In March 2026 it was ₦413,300.",
        DELTA_MANIFEST,
      ),
    ).toEqual({ ok: false, reason: "unsupported_period" });
  });
});

describe("isNarrationGrounded — Phase 12 distribution prose", () => {
  it("C: the deterministic distribution fallback (broke down … categories) is groundable", () => {
    expect(isNarrationGrounded(DISTRIBUTION_DETERMINISTIC_TEXT, DISTRIBUTION_MANIFEST)).toEqual({
      ok: true,
    });
  });

  it("E: an invented category is still rejected amid the newly allowed connective prose", () => {
    expect(
      isNarrationGrounded(
        "Of your ₦120,000 spending in July 2026, Software took ₦60,000, Transport took ₦60,000, and vs that, advanced-slackware took the rest.",
        BREAKDOWN_MANIFEST,
      ),
    ).toEqual({ ok: false, reason: "unsupported_category" });
  });
});

/* ------------------------------------------------------------
 * Phase 15 — category complement grounding (root cause: the deterministic
 * complement answer cites a combined figure, a combined share, and the exact
 * phrase "no remaining categories" (or "Apart from X") that the manifest must
 * certify so the narrator can reword it without inventing a number).
 * ------------------------------------------------------------ */

/** Aggregate complement: Food/Transport/Other = ₦120,000 = 20% of 2026. */
const COMPLEMENT_MANIFEST: NarrationManifest = {
  answerKind: "breakdown",
  facts: [
    { id: "F1", kind: "period", display: "2026", required: true },
    { id: "F2", kind: "money", display: "₦120,000 total", required: true },
    { id: "F3", kind: "percent", display: "20%", required: true },
    { id: "F4", kind: "category", display: "Food", required: true },
    { id: "F5", kind: "category", display: "Transport", required: true },
    { id: "F6", kind: "category", display: "Other", required: true },
  ],
  allowedTemplates: ["direct", "brief", "ranked"],
};

/** Excluding complement: everything apart from Rent in July 2026. */
const EXCLUDING_MANIFEST: NarrationManifest = {
  answerKind: "breakdown",
  facts: [
    { id: "F1", kind: "period", display: "July 2026", required: true },
    { id: "F2", kind: "money", display: "₦480,000 total", required: true },
    { id: "F3", kind: "percent", display: "80%", required: true },
    { id: "F4", kind: "category", display: "Inventory", required: true },
    { id: "F5", kind: "category", display: "Rent", required: false },
  ],
  allowedTemplates: ["direct", "brief", "ranked"],
};

/** Emptied aggregate complement: everything already listed. */
const EMPTY_REMAINDER_MANIFEST: NarrationManifest = {
  answerKind: "breakdown",
  facts: [
    { id: "F1", kind: "period", display: "2026", required: true },
    { id: "F2", kind: "relation", display: "no remaining categories", required: true },
  ],
  allowedTemplates: ["direct", "brief"],
};

describe("isNarrationGrounded — Phase 15 complement", () => {
  it("A: the deterministic aggregate complement sentence is internally groundable", () => {
    expect(
      isNarrationGrounded(
        "The remaining categories were Food, Transport and Other — ₦120,000 in total, 20% of your 2026 spending.",
        COMPLEMENT_MANIFEST,
      ),
    ).toEqual({ ok: true });
  });

  it("B: the deterministic excluding sentence is internally groundable", () => {
    expect(
      isNarrationGrounded(
        "Apart from Rent, the remaining categories were Inventory — ₦480,000 in total, 80% of your July 2026 spending.",
        EXCLUDING_MANIFEST,
      ),
    ).toEqual({ ok: true });
  });

  it("C: natural complement prose citing only verified figures is accepted", () => {
    expect(
      isNarrationGrounded(
        "Looking at everything that was not already listed, the rest of your spending came to Food, Transport and Other, together ₦120,000, which is 20% of your 2026 total.",
        COMPLEMENT_MANIFEST,
      ),
    ).toEqual({ ok: true });
  });

  it("D: the exact 'no remaining categories' phrase is accepted via the certified relation", () => {
    expect(
      isNarrationGrounded(
        "There were no remaining categories — your 2026 spending was fully covered by the categories listed.",
        EMPTY_REMAINDER_MANIFEST,
      ),
    ).toEqual({ ok: true });
  });

  it("E: an unverified complement total is rejected", () => {
    expect(
      isNarrationGrounded(
        "The remaining categories were Food, Transport and Other — ₦150,000 in total, 20% of your 2026 spending.",
        COMPLEMENT_MANIFEST,
      ),
    ).toEqual({ ok: false, reason: "unsupported_figure_or_coverage" });
  });

  it("F: an invented remaining percentage is rejected", () => {
    expect(
      isNarrationGrounded(
        "The remaining categories were Food, Transport and Other — ₦120,000 in total, 33% of your 2026 spending.",
        COMPLEMENT_MANIFEST,
      ),
    ).toEqual({ ok: false, reason: "unsupported_figure_or_coverage" });
  });

  it("G: a complement narration that names a category absent from the manifest is rejected", () => {
    expect(
      isNarrationGrounded(
        "The remaining categories were Food, Transport, Other and Petrol — ₦120,000 in total, 20% of your 2026 spending.",
        COMPLEMENT_MANIFEST,
      ),
    ).toEqual({ ok: false, reason: "unsupported_category" });
  });
});

/* ------------------------------------------------------------
 * Phase 17 — category share grounding. The deterministic share answer cites
 * the verified share figure, the verified amount, and the verified category.
 * The narrator may reword ("accounted for", "made up", "percent") only around
 * those verified facts — the SHARE FIGURE must be the manifest's "21%" (never
 * "21.0%"), invented shares fail, and the share is never the prior delta.
 * ------------------------------------------------------------ */

/** Inventory = 87,000 of 413,300 in July 2026 -> 21%; delta vs prior +43%. */
const SHARE_MANIFEST: NarrationManifest = {
  answerKind: "summary",
  facts: [
    { id: "F1", kind: "period", display: "July 2026", required: true },
    { id: "F2", kind: "category", display: "Inventory", required: true },
    { id: "F3", kind: "money", display: "₦87,000", required: true },
    { id: "F4", kind: "percent", display: "21%", required: true },
    { id: "F5", kind: "money", display: "prior June 2026: ₦61,000", required: true },
    { id: "F6", kind: "relation", display: "vs prior June 2026: +43%", required: false },
  ],
  allowedTemplates: ["direct", "brief"],
};

/** The exact deterministic nonzero share fallback sentence (with delta tail). */
const SHARE_DETERMINISTIC_TEXT =
  "Spending on inventory in July 2026 was ₦87,000 — 21% of July 2026 spending. That's +43% vs the prior period (₦87,000 now vs ₦61,000 before).";

/** `Other` had no spending in July 2026 -> 0%. */
const ZERO_SHARE_MANIFEST: NarrationManifest = {
  answerKind: "summary",
  facts: [
    { id: "F1", kind: "period", display: "July 2026", required: true },
    { id: "F2", kind: "category", display: "Other", required: true },
    { id: "F3", kind: "money", display: "₦0", required: true },
    { id: "F4", kind: "percent", display: "0%", required: true },
  ],
  allowedTemplates: ["direct", "brief"],
};

const ZERO_SHARE_DETERMINISTIC_TEXT =
  "No spending on other was recorded in July 2026 — 0% of July 2026 spending.";

describe("isNarrationGrounded — Phase 17 category share", () => {
  it("A: the deterministic nonzero share fallback (amount + share + delta tail) is internally groundable", () => {
    expect(isNarrationGrounded(SHARE_DETERMINISTIC_TEXT, SHARE_MANIFEST)).toEqual({ ok: true });
  });

  it("B: natural share prose citing only verified facts is accepted", () => {
    expect(
      isNarrationGrounded(
        "Inventory accounted for 21% of your July 2026 spending, for a total of ₦87,000, up from ₦61,000 in June.",
        SHARE_MANIFEST,
      ),
    ).toEqual({ ok: true });
  });

  it("C: a narrator-invented share is rejected (42% is not a verified figure)", () => {
    expect(
      isNarrationGrounded(
        "Spending on inventory in July 2026 was ₦87,000 — 42% of July 2026 spending.",
        SHARE_MANIFEST,
      ),
    ).toEqual({ ok: false, reason: "unsupported_figure_or_coverage" });
  });

  it("D: rounding the share the narrator's way ('21.0%') is rejected — only the verified '21%' passes", () => {
    expect(
      isNarrationGrounded(
        "Spending on inventory in July 2026 was ₦87,000 — 21.0% of July 2026 spending.",
        SHARE_MANIFEST,
      ),
    ).toEqual({ ok: false, reason: "unsupported_figure_or_coverage" });
  });

  it("E: an invented amount alongside the verified share is rejected", () => {
    expect(
      isNarrationGrounded(
        "Spending on inventory in July 2026 was ₦87,001 — 21% of July 2026 spending.",
        SHARE_MANIFEST,
      ),
    ).toEqual({ ok: false, reason: "unsupported_figure_or_coverage" });
  });

  it("F: an unverified period in a share answer is rejected", () => {
    expect(
      isNarrationGrounded(
        "Your spending on inventory in July 2026 was ₦87,000 — 21% of July 2026 spending, versus ₦61,000 in June 2026 and ₦87,000 again in March 2026.",
        SHARE_MANIFEST,
      ),
    ).toEqual({ ok: false, reason: "unsupported_period" });
  });

  it("G: the zero-share deterministic fallback is internally groundable", () => {
    expect(isNarrationGrounded(ZERO_SHARE_DETERMINISTIC_TEXT, ZERO_SHARE_MANIFEST)).toEqual({
      ok: true,
    });
  });

  it("H: a zero share may only cite 0% — any positive invented share is rejected", () => {
    expect(
      isNarrationGrounded(
        "No spending on other was recorded in July 2026 — 5% of July 2026 spending.",
        ZERO_SHARE_MANIFEST,
      ),
    ).toEqual({ ok: false, reason: "unsupported_figure_or_coverage" });
  });
});