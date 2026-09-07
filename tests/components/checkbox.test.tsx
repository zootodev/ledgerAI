import { describe, expect, it } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Checkbox } from "@/components/ui/checkbox";

function render(props: React.ComponentProps<typeof Checkbox> = {}): string {
  return renderToStaticMarkup(
    <Checkbox onChange={() => {}} {...props} />,
  );
}

describe("Checkbox", () => {
  it("renders a visible white check glyph on the brand-filled box when checked", () => {
    const html = render({ checked: true });
    // Brand-filled square carries the white check mark (text-on-accent).
    expect(html).toContain("lucide-check");
    expect(html).toContain("bg-brand");
    // The native input's checked state is correct.
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('checked=""');
  });

  it("renders no check glyph when unchecked but keeps a visible bordered box", () => {
    const html = render({ checked: false });
    expect(html).not.toContain("lucide-check");
    expect(html).not.toContain("bg-brand");
    expect(html).toContain("border-border-strong");
    // A controlled false checkbox renders without a checked attribute.
    expect(html).not.toContain('checked=""');
  });

  it("preserves the disabled state on the input and the disabled label styling", () => {
    const html = render({ checked: true, disabled: true });
    expect(html).toContain('disabled=""');
    expect(html).toContain("cursor-not-allowed");
  });

  it("keeps the check glyph visible when checked and disabled (visual state preserved)", () => {
    const html = render({ checked: true, disabled: true });
    expect(html).toContain("lucide-check");
    expect(html).toContain("disabled:opacity-50");
  });

  it("renders the existing indeterminate state as a minus glyph when indeterminate (no new behavior)", () => {
    const html = render({ indeterminate: true });
    expect(html).toContain("lucide-minus");
    expect(html).toContain("bg-brand");
    expect(html).not.toContain("lucide-check");
  });
});