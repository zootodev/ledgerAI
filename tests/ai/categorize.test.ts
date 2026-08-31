import { describe, expect, it } from "vitest";
import { categorizeByRules, REVIEW_THRESHOLD } from "../../src/lib/ai/rules";
import { RulesCategorizer } from "../../src/lib/ai/rules-categorizer";

describe("categorizeByRules (deterministic rules engine)", () => {
  it("matches a known merchant to its category with high confidence", () => {
    const r = categorizeByRules("UBER *TRIP");
    expect(r.categoryName).toBe("Transportation");
    expect(r.confidence).toBeGreaterThanOrEqual(REVIEW_THRESHOLD);
    expect(r.matched).toBe(true);
  });

  it("matches by keyword pattern", () => {
    expect(categorizeByRules("Meta Ads spend").categoryName).toBe("Marketing");
    expect(categorizeByRules("Rent payment").categoryName).toBe("Rent");
  });

  it("recognizes bank/POS transfers as Banking", () => {
    const r = categorizeByRules("MONIEPOINT TRANSFER");
    expect(r.categoryName).toBe("Banking");
  });

  it("flags unknown descriptions as Other with low confidence requiring review", () => {
    const r = categorizeByRules("Random future spend");
    expect(r.categoryName).toBe("Other");
    expect(r.confidence).toBeLessThan(REVIEW_THRESHOLD);
    expect(r.matched).toBe(false);
  });

  it("returns Other for an empty description", () => {
    const r = categorizeByRules("");
    expect(r.categoryName).toBe("Other");
    expect(r.matched).toBe(false);
  });
});

describe("RulesCategorizer (provider interface)", () => {
  const categorizer = new RulesCategorizer();

  it("implements the Categorizer interface and marks uncertain rows for review", async () => {
    const sure = await categorizer.categorize("MTN data recharge");
    expect(sure.categoryName).toBe("Utilities");
    expect(sure.needsReview).toBe(false);

    const unsure = await categorizer.categorize("random expense xyz");
    expect(unsure.categoryName).toBe("Other");
    expect(unsure.needsReview).toBe(true);
    expect(unsure.confidence).toBeLessThan(REVIEW_THRESHOLD);
  });
});
