import { describe, expect, it, vi } from "vitest";
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AskComingSoon } from "@/components/ask-v2/ask-coming-soon";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/ask-v2",
}));

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) =>
    createElement("a", { href }, children),
}));

describe("AskComingSoon", () => {
  it("states the preview is switched off inside the authenticated app layout", () => {
    const html = renderToStaticMarkup(
      <AskComingSoon userName="Ada Lovelace" userEmail="ada@example.com" onSignOut={vi.fn()} />,
    );
    expect(html).toContain("Ask isn&#x27;t open yet");
    expect(html).toContain("This preview is switched off.");
    expect(html).toContain("Go to overview");
    expect(html).toContain("Ada");
  });

  it("never renders an interactive composer or submit surface", () => {
    const html = renderToStaticMarkup(
      <AskComingSoon userName="Ada Lovelace" userEmail="ada@example.com" />,
    );
    expect(html).not.toContain('id="ask-v2-message"');
    expect(html).not.toContain("New conversation");
    expect(html).not.toContain('type="submit"');
    expect(html).not.toContain("<textarea");
  });

  it("never leaks internal implementation details or ids", () => {
    const html = renderToStaticMarkup(
      <AskComingSoon userName="Ada Lovelace" userEmail="ada@example.com" />,
    );
    // The header/sidebar chrome is the normal app shell; the notice itself
    // must not surface the internal v2 label, feature flag, or ids.
    expect(html).toContain("This preview is switched off.");
    expect(html).not.toContain("Ask LedgerAI (v2)");
    for (const key of [
      "ASK_V2_ENABLED",
      "businessId",
      "tenantId",
      "providerApiKey",
      "11111111-1111-4111-8111-111111111111",
    ]) {
      expect(html).not.toContain(key);
    }
  });
});