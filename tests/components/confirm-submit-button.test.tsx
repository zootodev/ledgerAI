import { describe, expect, it, vi, beforeEach } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * The pending state comes from `useFormStatus`, which can only be `true` during
 * a real submission. It is mocked here so the two branches — idle and in-flight
 * — can both be asserted. `importOriginal` is required: react-dom/server reads
 * React's shared internals from the `react-dom` entry, so the mock must keep the
 * real exports and override only `useFormStatus`.
 */
const status = vi.hoisted(() => ({ pending: false }));

vi.mock("react-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-dom")>();
  return {
    ...actual,
    useFormStatus: () => ({ pending: status.pending, data: null, method: null, action: null }),
  };
});

import { ConfirmSubmitButton } from "@/components/auth/confirm-submit-button";

function render(children: React.ReactNode): string {
  return renderToStaticMarkup(<ConfirmSubmitButton>{children}</ConfirmSubmitButton>);
}

beforeEach(() => {
  status.pending = false;
});

describe("ConfirmSubmitButton", () => {
  it("renders the action label as an enabled submit button when idle", () => {
    const markup = render("Confirm email");

    expect(markup).toContain('type="submit"');
    expect(markup).toContain("Confirm email");
    // Assert the attribute, not the string: the class list contains
    // `disabled:cursor-not-allowed` / `disabled:opacity-50`.
    expect(markup).not.toMatch(/<button[^>]*\sdisabled=""/);
  });

  it("disables itself and reads 'Verifying…' while the verify is in flight", () => {
    status.pending = true;

    const markup = render("Confirm email");

    expect(markup).toContain("Verifying…");
    expect(markup).not.toContain("Confirm email");
    expect(markup).toMatch(/<button[^>]*\sdisabled=""/);
  });
});
