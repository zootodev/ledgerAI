import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

vi.mock("@/lib/actions/categories", () => ({
  createCategoryAction: vi.fn(),
  updateCategoryAction: vi.fn(),
  deleteCategoryAction: vi.fn(),
}));

vi.mock("@/components/ui/modal", async () => {
  const React = await import("react");
  return {
    Modal: ({ children }: { children: React.ReactNode }) =>
      React.createElement("div", null, children),
  };
});

vi.mock("@/components/ui/confirm-dialog", () => ({
  ConfirmDialog: () => null,
}));

import { CategoriesManager } from "@/components/settings/categories-manager";
import type { CategoryServiceData } from "@/lib/services/categories";

const CATEGORIES: CategoryServiceData[] = [
  { id: "c1", name: "Sales", type: "income", isSystem: true },
  { id: "c2", name: "Fuel", type: "expense", isSystem: false },
];

function render() {
  return renderToStaticMarkup(<CategoriesManager categories={CATEGORIES} />);
}

describe("CategoriesManager add-vs-filter clarity", () => {
  it("labels the header actions as add buttons, not as a filter", () => {
    const html = render();

    expect(html).toContain("Add income");
    expect(html).toContain("Add expense");
  });

  it("exposes a real type filter with aria-pressed on each segment", () => {
    const html = render();

    expect(html).toContain('aria-label="Filter categories by type"');
    // Three segments, each exposing its state.
    expect(html.match(/aria-pressed="false"/g) ?? []).toHaveLength(2);
    // "All" is selected on first render.
    expect(html).toContain('aria-pressed="true"');
  });

  it("counts the visible categories rather than the whole list", () => {
    const html = render();

    expect(html).toContain("2 categories");
  });
});
