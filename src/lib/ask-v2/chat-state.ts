// ============================================================
// LedgerAI — Ask v2 client chat state (Phase 5)
// ------------------------------------------------------------
// The ONLY client-side "intelligence" in /ask-v2: a pure, dependency-free
// chat orchestration state machine. It holds the local transcript, the
// server-issued conversationId, and the pending flag. It contains ZERO
// financial logic — every figure, classification, and capability decision
// comes from the askV2Ask server action.
//
// Structural invariant (tested): the request the client can build is
// `{ message, conversationId? }` and nothing else — no businessId, userId,
// tenantId, tool keys, provider config, or finance payload can be attached.
// ============================================================

/** One chat bubble the browser renders. Local-only; never sent to the server. */
export interface AskV2ChatMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
}

export interface AskV2ChatState {
  /** Server-issued conversation id (null until the first persisted answer). */
  conversationId: string | null;
  /** The local transcript for the current session. */
  messages: AskV2ChatMessage[];
  /** True while one turn is in flight (blocks duplicate submission). */
  pending: boolean;
  /** Monotonic local bubble id counter. */
  seq: number;
}

export const ASK_V2_CHAT_INITIAL_STATE: AskV2ChatState = {
  conversationId: null,
  messages: [],
  pending: false,
  seq: 1,
};

export type AskV2ChatAction =
  | { type: "submit"; message: string }
  | { type: "receive"; text: string; conversationId: string | null | undefined }
  | { type: "error"; text: string }
  | { type: "reset" };

/**
 * Pure chat-state reducer. No side effects, no I/O — it is driven by
 * whichever transport (here the askV2Ask server action) the shell plugs in.
 */
export function askV2ChatReducer(
  state: AskV2ChatState,
  action: AskV2ChatAction,
): AskV2ChatState {
  switch (action.type) {
    case "submit": {
      const message = action.message.trim();
      // Guard against duplicate submission and blank sends.
      if (state.pending || message.length === 0) return state;
      return {
        ...state,
        messages: [
          ...state.messages,
          { id: state.seq, role: "user", content: message },
        ],
        pending: true,
        // seq only advances on an accepted message.
        seq: state.seq + 1,
      };
    }

    case "receive": {
      let conversationId = state.conversationId;
      if (action.conversationId) {
        conversationId = action.conversationId;
      } else if (isConversationGoneText(action.text)) {
        // The server told us our conversation id no longer exists — clear it
        // so the next message starts the follow-up fresh instead of failing
        // forever against a stale id.
        conversationId = null;
      }
      return {
        ...state,
        messages: [
          ...state.messages,
          { id: state.seq, role: "assistant", content: action.text },
        ],
        conversationId,
        pending: false,
        seq: state.seq + 1,
      };
    }

    case "error":
      return {
        ...state,
        messages: [
          ...state.messages,
          { id: state.seq, role: "assistant", content: action.text },
        ],
        pending: false,
        seq: state.seq + 1,
      };

    case "reset":
      return { ...ASK_V2_CHAT_INITIAL_STATE };
  }
}

/** The exact shape the browser sends to askV2Ask. Never more than this. */
export interface AskV2AskRequest {
  message: string;
  conversationId?: string;
}

/**
 * Build the server-action payload. Only `message` and (when we already own
 * one) `conversationId` can ever be included — tenant ids are structurally
 * impossible here (the server derives them from the session).
 */
export function buildAskV2Request(
  message: string,
  conversationId: string | null | undefined,
): AskV2AskRequest {
  return conversationId ? { message, conversationId } : { message };
}

/** The server's typed "your conversation is gone" wording. */
export function isConversationGoneText(text: string): boolean {
  return /no longer available/i.test(text);
}

/** Session/auth failures must land the user on /login, not hang the chat. */
export function isAuthError(error: unknown): boolean {
  return (
    error instanceof Error &&
    /authoriz|sign|session|authenticat|business|login/i.test(error.message)
  );
}

/** Safe, non-internal copy shown when the server action itself fails. */
export const ASK_V2_GENERIC_ERROR_TEXT =
  "Sorry — I couldn't look into that right now. Please try again.";

/** Example prompts. Pure examples: filling them in still sends through the
 * server pipeline on submit — the browser never interprets or answers. */
export const ASK_V2_SUGGESTIONS: readonly string[] = [
  "What did I spend last month?",
  "What was my biggest expense category?",
  "How does this month compare with last month?",
  "Show me my recent spending.",
];