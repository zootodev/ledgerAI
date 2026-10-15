import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import Home from "@/app/page";

// The landing page is a server component with no data dependencies, so a single
// static render captures everything the marketing surface promises.
const html = renderToStaticMarkup(<Home />);

describe("landing page", () => {
  it("promises plain-language insights instead of the on-hold Ask feature", () => {
    expect(html).toContain("plain-language insights");
    expect(html).not.toContain("plain-language answers");
  });

  it("labels the Ask card as Coming soon rather than a shipped feature", () => {
    expect(html).toContain("Ask your ledger");
    expect(html).toContain("Coming soon");
    // The title no longer claims the feature exists today.
    expect(html).not.toContain("Ask your ledger — coming soon");
  });

  it("renders a labelled monthly trend (months + naira axis)", () => {
    for (const month of ["May", "Jun", "Jul", "Aug", "Sep", "Oct"]) {
      expect(html).toContain(month);
    }
    expect(html).toContain("₦120k");
    expect(html).toContain("Monthly trend");
  });

  it("links privacy, terms and contact from the footer", () => {
    expect(html).toContain('href="/privacy"');
    expect(html).toContain('href="/terms"');
    expect(html).toContain("mailto:ifeoluwaniolufunmilayo@gmail.com");
  });

  it("shows a hero product preview only on large screens", () => {
    expect(html).toContain("lg:grid-cols-2");
    expect(html).toContain("hidden lg:block");
    expect(html).toContain("₦1,240,000");
    expect(html).toContain("₦612,400");
    expect(html).toContain("₦627,600");
  });

  it("keeps three-card rows at 1 column below sm and 2 columns at sm", () => {
    expect(html).toContain("sm:grid-cols-2 lg:grid-cols-3");
  });
});
