import { describe, expect, it, vi } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ASK_V2_MESSAGE_MAX_LENGTH,
  AskV2Composer,
} from "@/components/ask-v2/ask-v2-composer";

describe("AskV2Composer", () => {
  it("associates a visually-hidden label with the textarea", () => {
    const html = renderToStaticMarkup(
      <AskV2Composer value="" onChange={vi.fn()} onSubmit={vi.fn()} pending={false} />,
    );
    expect(html).toContain('id="ask-v2-message"');
    expect(html).toContain("<label"); // sr-only keeps it in the a11y tree
    expect(html).toContain("Ask about your business finances");
    expect(html).toContain(`maxLength="${ASK_V2_MESSAGE_MAX_LENGTH}"`);
  });

  it("pre-fills the textarea with the current draft", () => {
    const html = renderToStaticMarkup(
      <AskV2Composer value="Where did my money go?" onChange={vi.fn()} onSubmit={vi.fn()} pending={false} />,
    );
    expect(html).toContain("Where did my money go?</textarea>");
  });

  it("disables the send button while a turn is pending", () => {
    const html = renderToStaticMarkup(
      <AskV2Composer value="hello" onChange={vi.fn()} onSubmit={vi.fn()} pending={true} />,
    );
    expect(html).toContain('type="submit"');
    expect(html).toContain("disabled");
  });

  it("disables the send button while the draft is empty", () => {
    const html = renderToStaticMarkup(
      <AskV2Composer value="" onChange={vi.fn()} onSubmit={vi.fn()} pending={false} />,
    );
    expect(html).toContain("disabled");
  });

  it("shows Enter/Shift+Enter hints only for a non-empty draft", () => {
    const empty = renderToStaticMarkup(
      <AskV2Composer value="" onChange={vi.fn()} onSubmit={vi.fn()} pending={false} />,
    );
    expect(empty).not.toContain("Enter to send");
    expect(empty).not.toContain("Shift+Enter");
    expect(empty).toContain("LedgerAI never guesses");

    const full = renderToStaticMarkup(
      <AskV2Composer value="hi" onChange={vi.fn()} onSubmit={vi.fn()} pending={false} />,
    );
    expect(full).toContain("Enter to send");
    expect(full).toContain("Shift+Enter for a new line");
  });

  it("says Send, not interpret — the browser ships the plain text to the server", () => {
    const html = renderToStaticMarkup(
      <AskV2Composer value="hello" onChange={vi.fn()} onSubmit={vi.fn()} pending={false} />,
    );
    expect(html).toContain(">Send<");
  });
});