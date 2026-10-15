import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PasswordField } from "@/components/auth/password-field";

function render(overrides: Partial<Parameters<typeof PasswordField>[0]> = {}) {
  return renderToStaticMarkup(
    createElement(PasswordField, {
      id: "password",
      name: "password",
      ...overrides,
    } as never),
  );
}

describe("PasswordField", () => {
  it("renders a masked input with an accessible show-password toggle", () => {
    const html = render();
    expect(html).toContain('type="password"');
    expect(html).toContain("Show password");
    // The toggle is a plain button that must never submit the form.
    expect(html).toContain('type="button"');
  });

  it("wires field errors accessibly (aria-invalid + described-by)", () => {
    const html = render({ error: "Password must be at least 8 characters." });
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-describedby="password-error"');
    expect(html).toContain("Password must be at least 8 characters.");
  });

  it("shows the hint only when there is no error", () => {
    const hintHtml = render({ hint: "At least 8 characters." });
    expect(hintHtml).toContain("At least 8 characters.");

    const errorHtml = render({
      hint: "At least 8 characters.",
      error: "Passwords don't match.",
    });
    expect(errorHtml).toContain("Passwords don&#x27;t match.");
    expect(errorHtml).not.toContain("At least 8 characters.");
  });

  it("links the input to the hint via aria-describedby when valid", () => {
    const html = render({ hint: "At least 8 characters." });
    expect(html).toContain('aria-describedby="password-hint"');
  });

  it("uses an instructional default placeholder instead of a pre-filled mask", () => {
    const html = render();
    expect(html).toContain('placeholder="Enter your password"');
    expect(html).not.toContain("••••••••");
  });

  it("marks the field and label required when asked (asterisk + required attr)", () => {
    const html = render({ required: true });
    expect(html).toContain("required");
    // The asterisk marker shares the label, so the requirement is visible too.
    expect(html).toContain("text-danger");
    expect(html).toContain("*</span>");
  });
});