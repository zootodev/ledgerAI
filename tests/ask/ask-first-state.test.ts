import { describe, expect, it } from "vitest";
import { resolveAskFirstPaintState } from "@/lib/ask/ask-first-state";
import type { ConversationSummary } from "@/lib/types/assistant";

function conversation(id: string, overrides: Partial<ConversationSummary> = {}): ConversationSummary {
  return { id, title: `Conversation ${id}`, updatedAt: new Date().toISOString(), ...overrides };
}

describe("resolveAskFirstPaintState", () => {
  it("no conversations -> clean empty state (no open chat, no composer)", () => {
    const state = resolveAskFirstPaintState([], null);
    expect(state.showWorkspace).toBe(false);
    expect(state.activeId).toBeNull();
    expect(state.dropUrlId).toBe(false);
  });

  it("no conversations but a stale ?c= -> drops the url param, still empty state", () => {
    const state = resolveAskFirstPaintState([], "c-foreign");
    expect(state.showWorkspace).toBe(false);
    expect(state.activeId).toBeNull();
    expect(state.dropUrlId).toBe(true);
  });

  it("existing conversations without ?c= -> opens the chat workspace", () => {
    const state = resolveAskFirstPaintState([conversation("c1")], null);
    expect(state.showWorkspace).toBe(true);
    expect(state.activeId).toBeNull();
    expect(state.dropUrlId).toBe(false);
  });

  it("existing conversations with ?c= -> keeps the id for the ownership check", () => {
    const state = resolveAskFirstPaintState([conversation("c1"), conversation("c2")], "c1");
    expect(state.showWorkspace).toBe(true);
    expect(state.activeId).toBe("c1");
    expect(state.dropUrlId).toBe(false);
  });

  it("never trusts the client id: a ?c= without any conversations never opens a chat", () => {
    const state = resolveAskFirstPaintState([], "anything");
    expect(state.showWorkspace).toBe(false);
    expect(state.activeId).toBeNull();
  });
});