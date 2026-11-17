import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AuthValueStrip } from "@/components/auth/auth-value-strip";

/** Markup with tags removed, so assertions read as plain visible copy. */
function visible(html: string): string {
  return html.replace(/<[^>]*>/g, "");
}

describe("AuthValueStrip", () => {
  it("tells a new signup what to do after creating the account", () => {
    const html = renderToStaticMarkup(
      createElement(AuthValueStrip, { intent: "signup" }),
    );
    const copy = visible(html);
    expect(copy).toContain("After you sign up, upload one statement.");
    expect(copy).toContain(
      "LedgerAI shows every row before anything is saved.",
    );
  });

  it("points a returning sign-in at the latest import and review queue", () => {
    const html = renderToStaticMarkup(
      createElement(AuthValueStrip, { intent: "login" }),
    );
    const copy = visible(html);
    expect(copy).toContain(
      "Your latest import and any rows left in review are waiting on the overview.",
    );
    expect(copy).not.toContain("Upload one statement");
  });

  it("keeps the note to one sentence without a marketing triad", () => {
    const signup = visible(
      renderToStaticMarkup(createElement(AuthValueStrip, { intent: "signup" })),
    );
    const login = visible(
      renderToStaticMarkup(createElement(AuthValueStrip, { intent: "login" })),
    );
    expect(signup.match(/\./g)?.length).toBe(2);
    expect(login.match(/\./g)?.length).toBe(1);
    expect(signup).not.toContain("Profit —");
    expect(login).not.toContain("Profit —");
  });
});
