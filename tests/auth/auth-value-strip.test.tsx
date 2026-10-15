import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AuthValueStrip } from "@/components/auth/auth-value-strip";

describe("AuthValueStrip", () => {
  it("leads new signups with import → review → profit", () => {
    const html = renderToStaticMarkup(
      createElement(AuthValueStrip, { intent: "signup" }),
    );
    expect(html).toContain("Import.");
    expect(html).toContain("Upload a bank or PDF statement");
    expect(html).toContain("Review.");
    expect(html).toContain("Profit.");
  });

  it("reframes the same outcomes for an existing sign-in", () => {
    const html = renderToStaticMarkup(
      createElement(AuthValueStrip, { intent: "login" }),
    );
    expect(html).toContain("Review.");
    expect(html).toContain("Recategorize");
    expect(html).not.toContain("Upload a bank or PDF statement");
  });

  it("always lands on the profit outcome", () => {
    const signup = renderToStaticMarkup(
      createElement(AuthValueStrip, { intent: "signup" }),
    );
    const login = renderToStaticMarkup(
      createElement(AuthValueStrip, { intent: "login" }),
    );
    expect(signup).toContain("Profit.");
    expect(login).toContain("Profit.");
  });
});