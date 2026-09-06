import { describe, expect, it, vi, beforeEach } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/lib/actions/rules", () => ({
  deleteCategoryRuleAction: vi.fn().mockResolvedValue({ ok: true }),
}));

import { RulesManager } from "@/components/settings/rules-manager";
import type { CategoryRuleDto } from "@/types";

const BUSINESS = "11111111-1111-4111-8111-111111111111";

function makeRule(overrides: Partial<CategoryRuleDto> = {}): CategoryRuleDto {
  return {
    id: "rule-1",
    businessId: BUSINESS,
    matchType: "merchant",
    pattern: "UBER",
    categoryId: null,
    categoryName: "",
    createdAt: "2026-08-15T10:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("RulesManager", () => {
  it("renders the empty state copy when there are no rules", () => {
    const html = renderToStaticMarkup(<RulesManager rules={[]} />);
    expect(html).toContain("No rules yet");
    expect(html).toContain("they appear as you correct categories during imports");
  });

  it("renders a rule row with its uppercase pattern and badges", () => {
    const rules = [makeRule({ pattern: "paystack", categoryId: "cat-1", categoryName: "Marketing" })];
    const html = renderToStaticMarkup(<RulesManager rules={rules} />);

    expect(html).toContain("PAYSTACK");
    expect(html).toContain("Merchant");
    expect(html).toContain("Learned");
    expect(html).toContain("Marketing");
    expect(html).toContain("2026-08-15");
  });

  it("renders an Uncategorised badge when the target category id is null", () => {
    const html = renderToStaticMarkup(<RulesManager rules={[makeRule()]} />);
    expect(html).toContain("Uncategorised");
  });

  it("renders a delete control per rule with an accessible label", () => {
    const html = renderToStaticMarkup(<RulesManager rules={[makeRule()]} />);
    expect(html).toContain("Delete rule for UBER");
  });

  it("pluralises the rule count correctly", () => {
    const rules = [makeRule({ id: "a" }), makeRule({ id: "b" })];
    const html = renderToStaticMarkup(<RulesManager rules={rules} />);
    expect(html).toContain("2 rules");
  });
});