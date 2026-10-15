import { describe, expect, it, vi, beforeEach } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/lib/actions/onboarding", () => ({
  completeOnboardingAction: vi.fn(),
}));

import { OnboardingForm } from "@/components/onboarding/onboarding-form";

const defaults = { name: "", country: "NG", currency: "NGN" };

beforeEach(() => {
  vi.clearAllMocks();
});

function render() {
  return renderToStaticMarkup(
    React.createElement(OnboardingForm, { defaults: defaults as never }),
  );
}

describe("OnboardingForm", () => {
  it("uses human-readable country labels instead of bare codes", () => {
    const html = render();
    expect(html).toContain(">Nigeria<");
    expect(html).toContain(">United States<");
    expect(html).not.toContain(">NG<");
    expect(html).not.toContain(">US<");
  });

  it("keeps currency codes (they are self-explanatory) and shows the setup flow", () => {
    const html = render();
    expect(html).toContain(">NGN<");
    expect(html).toContain("Step 1 of 2");
  });
});