import { describe, expect, it } from "vitest";
import {
  ASK_V2_CHAT_INITIAL_STATE,
  ASK_V2_GENERIC_ERROR_TEXT,
  ASK_V2_SUGGESTIONS,
  askV2ChatReducer,
  buildAskV2Request,
  isAuthError,
  isConversationGoneText,
  type AskV2ChatMessage,
  type AskV2ChatState,
} from "@/lib/ask-v2/chat-state";

const CONVERSATION_ID = "11111111-1111-4111-8111-111111111111";

function expectMessages(
  state: AskV2ChatState,
  roles: AskV2ChatMessage["role"][],
) {
  expect(state.messages.map((m) => m.role)).toEqual(roles);
}

describe("askV2ChatReducer", () => {
  it("starts in a clean, non-pending state", () => {
    expect(ASK_V2_CHAT_INITIAL_STATE).toEqual({
      conversationId: null,
      messages: [],
      pending: false,
      seq: 1,
    });
  });

  it("appends the user message and marks the turn pending on submit", () => {
    const state = askV2ChatReducer(ASK_V2_CHAT_INITIAL_STATE, {
      type: "submit",
      message: "What did I spend last month?",
    });
    expect(state.pending).toBe(true);
    expect(state.conversationId).toBeNull();
    expectMessages(state, ["user"]);
    expect(state.messages[0].content).toBe("What did I spend last month?");
    expect(state.seq).toBe(2);
  });

  it("refuses a blank submit", () => {
    const state = askV2ChatReducer(ASK_V2_CHAT_INITIAL_STATE, {
      type: "submit",
      message: "   ",
    });
    expect(state).toEqual(ASK_V2_CHAT_INITIAL_STATE);
  });

  it("refuses a duplicate submit while a turn is in flight", () => {
    const afterSubmit = askV2ChatReducer(ASK_V2_CHAT_INITIAL_STATE, {
      type: "submit",
      message: "hello",
    });
    const state = askV2ChatReducer(afterSubmit, { type: "submit", message: "again" });
    expectMessages(state, ["user"]);
    expect(state.pending).toBe(true);
  });

  it("completes a turn by appending the assistant answer", () => {
    const afterSubmit = askV2ChatReducer(ASK_V2_CHAT_INITIAL_STATE, {
      type: "submit",
      message: "hello",
    });
    const state = askV2ChatReducer(afterSubmit, {
      type: "receive",
      text: "You spent NGN 250,000.",
      conversationId: CONVERSATION_ID,
    });
    expect(state.pending).toBe(false);
    expect(state.conversationId).toBe(CONVERSATION_ID);
    expectMessages(state, ["user", "assistant"]);
    expect(state.messages[1].content).toBe("You spent NGN 250,000.");
    expect(state.seq).toBe(3);
  });

  it("keeps the conversation id when a clarification or unsupported answer returns null", () => {
    const withConversation = askV2ChatReducer(
      {
        ...ASK_V2_CHAT_INITIAL_STATE,
        messages: [{ id: 1, role: "user" as const, content: "hello" }],
        conversationId: CONVERSATION_ID,
        seq: 2,
      },
      { type: "receive", text: "Did you spend money?", conversationId: null },
    );
    expect(withConversation.conversationId).toBe(CONVERSATION_ID);
  });

  it("clears a dead conversation id when the server reports it is gone", () => {
    const withConversation = askV2ChatReducer(
      {
        ...ASK_V2_CHAT_INITIAL_STATE,
        conversationId: CONVERSATION_ID,
        seq: 2,
      },
      {
        type: "receive",
        text: "That conversation is no longer available. Starting a fresh one.",
        conversationId: null,
      },
    );
    expect(withConversation.conversationId).toBeNull();
  });

  it("renders an error turn without dropping the conversation", () => {
    const withConversation = askV2ChatReducer(
      {
        ...ASK_V2_CHAT_INITIAL_STATE,
        conversationId: CONVERSATION_ID,
        seq: 2,
      },
      { type: "error", text: ASK_V2_GENERIC_ERROR_TEXT },
    );
    expect(withConversation.pending).toBe(false);
    expect(withConversation.conversationId).toBe(CONVERSATION_ID);
    expectMessages(withConversation, ["assistant"]);
  });

  it("resets to the pristine initial state", () => {
    const busy: AskV2ChatState = {
      conversationId: CONVERSATION_ID,
      messages: [{ id: 1, role: "user", content: "what remains after spending" }],
      pending: true,
      seq: 2,
    };
    expect(askV2ChatReducer(busy, { type: "reset" })).toEqual(ASK_V2_CHAT_INITIAL_STATE);
  });
});

describe("buildAskV2Request", () => {
  it("sends only the message when no conversation exists yet", () => {
    const request = buildAskV2Request("hello", null);
    expect(request).toEqual({ message: "hello" });
    expect(Object.keys(request).sort()).toEqual(["message"]);
  });

  it("never attaches tenant or user ids", () => {
    const request = buildAskV2Request("hello", null) as unknown as Record<string, unknown>;
    for (const key of ["businessId", "userId", "tenantId", "tools", "provider"]) {
      expect(request[key]).toBeUndefined();
    }
  });

  it("includes the owned conversation id on follow-ups", () => {
    const request = buildAskV2Request("follow up", CONVERSATION_ID);
    expect(request).toEqual({ message: "follow up", conversationId: CONVERSATION_ID });
    expect(Object.keys(request).sort()).toEqual(["conversationId", "message"]);
  });
});

describe("conversation-gone detection", () => {
  it("recognises the server's gone wording", () => {
    expect(isConversationGoneText("That conversation is no longer available.")).toBe(true);
    expect(isConversationGoneText("Which August did you mean?")).toBe(false);
  });
});

describe("isAuthError", () => {
  it("flags session and authorization failures", () => {
    expect(isAuthError(new Error("You must be signed in."))).toBe(true);
    expect(isAuthError(new Error("No business is set up for this account."))).toBe(true);
    expect(isAuthError(new Error("authorization failed"))).toBe(true);
    expect(isAuthError(new Error("session expired"))).toBe(true);
  });

  it("does not flag unrelated or non-error values", () => {
    expect(isAuthError(new Error("Provider unavailable"))).toBe(false);
    expect(isAuthError("You must be signed in.")).toBe(false);
    expect(isAuthError(null)).toBe(false);
    expect(isAuthError(undefined)).toBe(false);
  });
});

describe("ASK_V2_SUGGESTIONS", () => {
  it("offers four examples covering every currently supported capability", () => {
    expect(ASK_V2_SUGGESTIONS.length).toBe(4);
    for (const s of ASK_V2_SUGGESTIONS) expect(s.trim().length).toBeGreaterThan(0);
    const joined = ASK_V2_SUGGESTIONS.join(" ");
    // Supported capabilities only — no remainder, no search_transactions.
    expect(joined).toContain("biggest expense category");
    expect(joined).toContain("compare");
    expect(joined).toContain("recent spending");
    expect(joined).toMatch(/spend last month/i);
    expect(joined).not.toMatch(/remainder/i);
    expect(joined).not.toMatch(/search_transactions/i);
  });
});