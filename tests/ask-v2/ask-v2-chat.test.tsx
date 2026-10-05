import { describe, expect, it, vi, beforeEach } from "vitest";
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AskV2Chat } from "@/components/ask-v2/ask-v2-chat";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/ask-v2",
}));

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) =>
    createElement("a", { href }, children),
}));

vi.mock("@/app/ask-v2/actions", () => ({
  askV2Ask: vi.fn(),
}));

import { askV2Ask } from "@/app/ask-v2/actions";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AskV2Chat", () => {
  it("renders the v2 shell inside the authenticated app layout", () => {
    const html = renderToStaticMarkup(
      <AskV2Chat
        userName="Ada Lovelace"
        userEmail="ada@example.com"
        businessName="Acme Studio"
        currency="USD"
        onSignOut={vi.fn()}
      />,
    );
    expect(html).toContain("Ask LedgerAI (v2)");
    expect(html).toContain("Ask questions about your business finances");
    expect(html).toContain("Acme Studio");
    expect(html).toContain("USD");
  });

  it("renders the chat workspace, composer, and a new-conversation control", () => {
    const html = renderToStaticMarkup(
      <AskV2Chat
        userName="Ada Lovelace"
        userEmail="ada@example.com"
        businessName="Acme Studio"
        currency="USD"
      />,
    );
    expect(html).toContain("New conversation");
    expect(html).toContain('id="ask-v2-message"');
    expect(html).toContain("Ask about your business finances.");
  });

  it("exposes the transcript as an accessible live region", () => {
    const html = renderToStaticMarkup(
      <AskV2Chat userName="Ada Lovelace" userEmail="ada@example.com" businessName="Acme" currency="USD" />,
    );
    expect(html).toContain('role="log"');
    expect(html).toContain('aria-live="polite"');
  });

  it("never renders business ids, user ids, or tenant ids", () => {
    const html = renderToStaticMarkup(
      <AskV2Chat
        userName="Ada Lovelace"
        userEmail="ada@example.com"
        businessName="Acme Studio"
        currency="USD"
      />,
    );
    for (const key of [
      "businessId",
      "userId",
      "tenantId",
      "providerApiKey",
      "11111111-1111-4111-8111-111111111111",
    ]) {
      expect(html).not.toContain(key);
    }
  });

  it("does not call the server action during a plain render", () => {
    renderToStaticMarkup(
      <AskV2Chat userName="Ada" userEmail="ada@example.com" businessName="Acme" currency="USD" />,
    );
    expect(askV2Ask).not.toHaveBeenCalled();
  });
});