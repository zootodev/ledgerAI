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
  it("presents the Coming Soon announcement in the authenticated app layout", () => {
    const html = renderToStaticMarkup(
      <AskComingSoon userName="Ada Lovelace" userEmail="ada@example.com" onSignOut={vi.fn()} />,
    );
    expect(html).toContain("Ask LedgerAI");
    expect(html).toContain("Coming Soon");
    expect(html).toContain("Ask is coming soon");
    expect(html).toContain("smarter way to help you understand your business finances");
    expect(html).toContain("Ask will let you explore your finances using natural language.");
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
    // The header/sidebar chrome is the normal app shell; the announcement
    // itself must not surface the internal v2 label, feature flag, or ids.
    expect(html).toContain("Ask LedgerAI");
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