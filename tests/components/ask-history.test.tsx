import { describe, expect, it, vi } from "vitest";
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AskHistoryList } from "@/components/ask/ask-history";
import type { ConversationSummary } from "@/lib/types/assistant";

// Fixed clock in the TEST process's local timezone (no UTC assumptions).
const NOW = new Date();
NOW.setHours(14, 0, 0, 0);

/** ISO string whose LOCAL calendar day is exactly `daysAgo` before NOW. */
function isoDaysAgo(daysAgo: number): string {
  const d = new Date(
    NOW.getFullYear(),
    NOW.getMonth(),
    NOW.getDate() - daysAgo,
    12,
    0,
    0,
  );
  return d.toISOString();
}

function conversation(overrides: Partial<ConversationSummary> & { id: string }): ConversationSummary {
  return {
    id: overrides.id,
    title: overrides.title ?? "Profit — Last month",
    updatedAt: overrides.updatedAt ?? isoDaysAgo(0),
  };
}

function render(list: Partial<React.ComponentProps<typeof AskHistoryList>> = {}) {
  const handlers = {
    onNewChat: vi.fn(),
    onSelect: vi.fn(),
    onRename: vi.fn(),
    onDelete: vi.fn(),
    onDeleteAll: vi.fn(),
    ...list,
  };
  const html = renderToStaticMarkup(
    createElement(AskHistoryList, {
      conversations: list.conversations ?? [],
      activeId: list.activeId ?? null,
      disabled: list.disabled ?? false,
      now: NOW,
      loading: list.loading ?? false,
      error: list.error ?? false,
      onRetry: list.onRetry ?? vi.fn(),
      onNewChat: handlers.onNewChat,
      onSelect: handlers.onSelect,
      onRename: handlers.onRename,
      onDelete: handlers.onDelete,
      onDeleteAll: handlers.onDeleteAll,
    }),
  );
  return { html, handlers };
}

describe("AskHistoryList (presentational)", () => {
  it("offers a New chat action", () => {
    const { html } = render();
    expect(html).toContain("New chat");
  });

  it("shows an empty state when there are no conversations", () => {
    const { html } = render();
    expect(html).toContain("No conversations yet");
    expect(html).not.toContain("Delete all conversations");
  });

  it("splits conversations into Today / Yesterday / Earlier buckets", () => {
    const conversations = [
      conversation({ id: "c-earlier", title: "Spending — June", updatedAt: isoDaysAgo(5) }),
      conversation({ id: "c-yesterday", title: "Income — Yesterday", updatedAt: isoDaysAgo(1) }),
      conversation({ id: "c-today", title: "Balance — Today", updatedAt: isoDaysAgo(0) }),
    ];
    const { html } = render({ conversations });

    expect(html).toContain("Today");
    expect(html).toContain("Yesterday");
    expect(html).toContain("Earlier");
    // Items are rendered in the given (newest-first) order.
    expect(html.indexOf("Balance — Today")).toBeLessThan(html.indexOf("Income — Yesterday"));
    expect(html.indexOf("Income — Yesterday")).toBeLessThan(html.indexOf("Spending — June"));
  });

  it("marks the active conversation and exposes per-item actions with labels", () => {
    const conversations = [
      conversation({ id: "c1", title: "Profit — Last month" }),
      conversation({ id: "c2", title: "Income — This month" }),
    ];
    const { html } = render({ conversations, activeId: "c2" });

    expect(html).toContain("aria-current=\"true\"");
    expect(html).toContain('aria-label="Rename Profit — Last month"');
    expect(html).toContain('aria-label="Delete Profit — Last month"');
    expect(html).toContain("Delete all conversations");
  });

  it("disables switching and actions while an exchange is in flight", () => {
    const conversations = [conversation({ id: "c1" })];
    const { html } = render({ conversations, disabled: true });
    // Every interactive control becomes disabled.
    expect((html.match(/disabled=""/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  it("renders loading skeletons and retry on error without items", () => {
    const loading = render({ conversations: [], loading: true });
    expect(loading.html).not.toContain("No conversations yet");
    expect(loading.html).not.toContain("Delete all conversations");

    const error = render({ conversations: [], error: true });
    expect(error.html).toContain("load your history.");
    expect(error.html).toContain("Try again");
  });

  it("never renders a delete-all footer in loading or error states", () => {
    const loadingHtml = render({ conversations: [conversation({ id: "c1" })], loading: true }).html;
    expect(loadingHtml).not.toContain("Delete all conversations");
  });
});