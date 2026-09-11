// ============================================================
// LedgerAI — Ask first-paint state resolver (pure, unit-testable)
// ------------------------------------------------------------
// Decides how the Ask page should open from the server-provided
// conversation list and the optional ?c= URL param.
//
// Product rule (Phase 8B corrective pass):
//   NO CONVERSATION = NO OPEN CHAT.
// A business with zero conversations gets a clean empty state with a
// "Start new chat" action instead of an active chat workspace. A stale
// ?c= id is dropped (no client trust without tenant-scoped service
// checks); when the business has conversations the id is kept so the
// existing tenant-scoped ownership check runs during load.
// ============================================================

import type { ConversationSummary } from "@/lib/types/assistant";

export interface AskFirstPaintState {
  /** Conversation id that should be (re)selected on first paint. */
  activeId: string | null;
  /** Render the chat workspace (log + composer) instead of the empty state. */
  showWorkspace: boolean;
  /** Remove the stale ?c= param from the URL. */
  dropUrlId: boolean;
}

export function resolveAskFirstPaintState(
  conversations: ConversationSummary[],
  initialConversationId: string | null,
): AskFirstPaintState {
  if (conversations.length === 0) {
    return {
      activeId: null,
      showWorkspace: false,
      dropUrlId: Boolean(initialConversationId),
    };
  }
  return {
    activeId: initialConversationId,
    showWorkspace: true,
    dropUrlId: false,
  };
}