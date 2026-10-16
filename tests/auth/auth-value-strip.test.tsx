import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AuthValueStrip } from "@/components/auth/auth-value-strip";

/** Markup with tags removed, so assertions read as plain visible copy. */
function visible(html: string): string {
  return html.replace(/<[^>]*>/g, "");
}

describe("AuthValueStrip", () => {
  it("leads new signups with import → review → profit", () => {
    const html = renderToStaticMarkup(
      createElement(AuthValueStrip, { intent: "signup" }),
    );
    const copy = visible(html);
    expect(copy).toContain("Import — Upload a bank or PDF statement");
    expect(copy).toContain("Review — Confirm how each transaction is categorized");
    expect(copy).toContain("Profit — See income minus costs, clearly");
  });

  it("renders each verb as a bold label followed by a full sentence", () => {
    const html = renderToStaticMarkup(
      createElement(AuthValueStrip, { intent: "login" }),
    );
    const copy = visible(html);
    // No "Verb." fragments: the label is joined by a dash instead.
    expect(copy).toContain("Review — Check recent imports and uncategorized rows");
    expect(copy).not.toContain("Review.");
    expect(copy).not.toContain("Fix.");
    expect(copy).not.toContain("Profit.");
    expect(copy).toContain("Recategorize");
  });

  it("reframes the same outcomes for an existing sign-in", () => {
    const html = renderToStaticMarkup(
      createElement(AuthValueStrip, { intent: "login" }),
    );
    expect(html).toContain("Recategorize");
    expect(html).not.toContain("Upload a bank or PDF statement");
  });

  it("always lands on the profit outcome", () => {
    const signup = visible(
      renderToStaticMarkup(createElement(AuthValueStrip, { intent: "signup" })),
    );
    const login = visible(
      renderToStaticMarkup(createElement(AuthValueStrip, { intent: "login" })),
    );
    expect(signup).toContain("Profit — See income minus costs, clearly");
    expect(login).toContain("Profit — Keep your profit picture up to date");
  });
});
