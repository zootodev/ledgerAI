import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  DateField,
  commitIsoSelection,
  commitTypedDate,
} from "@/components/ui/date-field";

describe("DateField native picker", () => {
  it("gives the calendar button an accessible name and a button type", () => {
    const html = renderToStaticMarkup(
      createElement(DateField, { value: "2026-10-01" }),
    );
    expect(html).toContain('aria-label="Choose date"');
    expect(html).toMatch(/<button[^>]*type="button"[^>]*aria-label="Choose date"/);
  });

  it("renders a hidden ISO picker with bounds and no form name", () => {
    const html = renderToStaticMarkup(
      createElement(DateField, {
        value: "2026-10-01",
        min: "2026-01-01",
        max: "2026-12-31",
      }),
    );
    const hiddenPicker = html.match(/<input[^>]*type="date"[^>]*\/>/)?.[0] ?? "";
    expect(hiddenPicker).toContain('value="2026-10-01"');
    expect(hiddenPicker).toContain('min="2026-01-01"');
    expect(hiddenPicker).toContain('max="2026-12-31"');
    expect(hiddenPicker).toContain('tabindex="-1"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toMatch(/<input[^>]*type="date"[^>]*name=/);
  });

  it("keeps the visible text input in DD/MM/YYYY order with room for the icon", () => {
    const html = renderToStaticMarkup(
      createElement(DateField, { value: "2026-10-01" }),
    );
    expect(html).toContain('value="01/10/2026"');
    expect(html).toContain("pr-10");
  });

  it("sends a picked ISO day through onIsoChange and shows DD/MM/YYYY", () => {
    const onIsoChange = vi.fn();
    const draft = commitIsoSelection("2026-10-01", onIsoChange);
    expect(onIsoChange).toHaveBeenCalledTimes(1);
    expect(onIsoChange).toHaveBeenCalledWith("2026-10-01");
    expect(draft).toEqual({ iso: "2026-10-01", text: "01/10/2026" });
  });

  it("still accepts typed DD/MM/YYYY and ignores invalid days", () => {
    const onIsoChange = vi.fn();
    const typed = commitTypedDate("1/10/2026", "", onIsoChange);
    expect(typed.parsed).toBe("2026-10-01");
    expect(onIsoChange).toHaveBeenCalledWith("2026-10-01");
    expect(typed.draft.text).toBe("1/10/2026");

    onIsoChange.mockClear();
    const invalid = commitTypedDate("31/02/2026", "", onIsoChange);
    expect(invalid.parsed).toBeNull();
    expect(onIsoChange).not.toHaveBeenCalled();
  });
});
