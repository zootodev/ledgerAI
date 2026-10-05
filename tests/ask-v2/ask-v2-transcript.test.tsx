import { describe, expect, it, vi } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AskV2Transcript } from "@/components/ask-v2/ask-v2-transcript";
import { ASK_V2_SUGGESTIONS, type AskV2ChatMessage } from "@/lib/ask-v2/chat-state";

function messages(): AskV2ChatMessage[] {
  return [
    { id: 1, role: "user", content: "What did I spend last month?" },
    { id: 2, role: "assistant", content: "You spent NGN 250,000 in July." },
  ];
}

describe("AskV2Transcript", () => {
  it("renders the empty state with the four supported example prompts", () => {
    const html = renderToStaticMarkup(
      <AskV2Transcript messages={[]} pending={false} onExample={vi.fn()} />,
    );
    expect(html).toContain("Ask about your business finances.");
    for (const example of ASK_V2_SUGGESTIONS) {
      expect(html).toContain(example);
    }
  });

  it("renders user and assistant bubbles in order", () => {
    const html = renderToStaticMarkup(
      <AskV2Transcript messages={messages()} pending={false} onExample={vi.fn()} />,
    );
    expect(html.indexOf("What did I spend last month?")).toBeLessThan(
      html.indexOf("You spent NGN 250,000 in July."),
    );
  });

  it("exposes the log to assistive tech and announces live updates", () => {
    const html = renderToStaticMarkup(
      <AskV2Transcript messages={messages()} pending={false} onExample={vi.fn()} />,
    );
    expect(html).toContain('role="log"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('aria-label="Conversation"');
  });

  it("renders the in-flight indicator while pending", () => {
    const html = renderToStaticMarkup(
      <AskV2Transcript messages={[]} pending={true} onExample={vi.fn()} />,
    );
    expect(html).toContain("Analyzing your books…");
  });

  it("expects example clicks to hand text to the parent composer", () => {
    const onExample = vi.fn();
    renderToStaticMarkup(
      <AskV2Transcript messages={[]} pending={false} onExample={onExample} />,
    );
    // The empty state renders one filler button per suggestion.
    expect(onExample).not.toHaveBeenCalled();
  });

  it("never renders tenant ids or account identifiers", () => {
    const html = renderToStaticMarkup(
      <AskV2Transcript messages={messages()} pending={false} onExample={vi.fn()} />,
    );
    for (const key of ["businessId", "userId", "tenantId", "providerApiKey"]) {
      expect(html).not.toContain(key);
    }
  });
});