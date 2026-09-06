import { describe, expect, it } from "vitest";
import { categorizeByRules, REVIEW_THRESHOLD } from "../../src/lib/ai/rules";
import { RulesCategorizer } from "../../src/lib/ai/rules-categorizer";
import type { CategoryRuleDto } from "../../src/types";

function makeRule(overrides: Partial<CategoryRuleDto> = {}): CategoryRuleDto {
  return {
    id: "rule-1",
    businessId: "biz-a",
    matchType: "merchant",
    pattern: "UBER",
    categoryId: "00000000-0000-4000-8000-000000000005",
    categoryName: "Marketing",
    createdAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

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

describe("categorizeByRules with business rules (learned corrections)", () => {
  it("ranks a learned business merchant above a built-in merchant", () => {
    const r = categorizeByRules(
      "UBER *TRIP",
      undefined,
      [makeRule()],
    );
    expect(r.categoryName).toBe("Marketing");
    expect(r.confidence).toBe(0.94);
    expect(r.matched).toBe(true);
    expect(r.businessRule).toEqual({
      categoryId: "00000000-0000-4000-8000-000000000005",
      categoryName: "Marketing",
    });
  });

  it("ranks learned merchant rules above learned keyword rules of the same text", () => {
    const rules = [
      makeRule({ id: "kw", matchType: "keyword", pattern: "UBER" }),
      makeRule({ id: "merchant", matchType: "merchant" }),
    ];
    const r = categorizeByRules("UBER TRIP", undefined, rules);
    expect(r.businessRule?.categoryId).toBe(makeRule().categoryId);
    expect(r.categoryName).toBe("Marketing");
  });

  it("is case-insensitive for merchant patterns", () => {
    const r = categorizeByRules(
      "uber taxi ride 45",
      undefined,
      [makeRule()],
    );
    expect(r.categoryName).toBe("Marketing");
  });

  it("matches keyword business rules case-insensitively", () => {
    const r = categorizeByRules(
      "cross river wine shop",
      undefined,
      [makeRule({ matchType: "keyword", pattern: "WINE" })],
    );
    expect(r.categoryName).toBe("Marketing");
    expect(r.businessRule?.categoryId).toBe(makeRule().categoryId);
  });

  it("ignores cases without business rules to stay byte-for-byte identical", () => {
    const without = categorizeByRules("UBER *TRIP");
    const withEmpty = categorizeByRules("UBER *TRIP", undefined, []);
    const withUndefined = categorizeByRules("UBER *TRIP", undefined, undefined);
    expect(withEmpty).toEqual(without);
    expect(withUndefined).toEqual(without);
  });

  it("breaks multi-match ties by longest pattern, then oldest createdAt, then id", () => {
    const rules = [
      makeRule({
        id: "r2",
        pattern: "UBER",
        categoryName: "Short New",
        categoryId: "00000000-0000-4000-8000-000000000011",
        createdAt: "2026-09-02T00:00:00.000Z",
      }),
      makeRule({
        id: "r3",
        pattern: "UBER TRIP",
        categoryName: "Longest",
        categoryId: "00000000-0000-4000-8000-000000000012",
        createdAt: "2026-09-01T00:00:00.000Z",
      }),
      makeRule({
        id: "r1",
        pattern: "UBER",
        categoryName: "Short Old",
        categoryId: "00000000-0000-4000-8000-000000000013",
        createdAt: "2026-09-01T00:00:00.000Z",
      }),
    ];
    const longest = categorizeByRules("UBER TRIP", undefined, rules);
    expect(longest.categoryName).toBe("Longest");

    const oldestCreatedAtWins = categorizeByRules("UBER TRIP", undefined, [
      rules[0], // UBER, newest
      rules[2], // UBER, oldest
    ]);
    expect(oldestCreatedAtWins.categoryName).toBe("Short Old");
  });

  it("treats an unknown pattern as Other with a business rule fall-through", () => {
    const r = categorizeByRules(
      "Rare exotic spend",
      undefined,
      [makeRule({ pattern: "UBER" })],
    );
    expect(r.categoryName).toBe("Other");
    expect(r.matched).toBe(false);
    expect(r.businessRule).toBeUndefined();
  });

  it("guards against malformed keyword patterns without crashing", () => {
    const r = categorizeByRules(
      "anything",
      undefined,
      [makeRule({ matchType: "keyword", pattern: "(" })],
    );
    expect(r.categoryName).toBe("Other");
  });
});

describe("RulesCategorizer with business rules", () => {
  it("exposes the matched business rule on the result", async () => {
    const categorizer = new RulesCategorizer({ businessRules: [makeRule()] });
    const result = await categorizer.categorize("UBER *TRIP");
    expect(result.categoryName).toBe("Marketing");
    expect(result.businessRule?.categoryName).toBe("Marketing");
    expect(result.needsReview).toBe(false);
  });

  it("falls through to built-ins when no business rule matches", async () => {
    const categorizer = new RulesCategorizer({ businessRules: [makeRule()] });
    const result = await categorizer.categorize("MTN data recharge");
    expect(result.categoryName).toBe("Utilities");
    expect(result.businessRule).toBeUndefined();
  });
});
