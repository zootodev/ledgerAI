"use server";

// ============================================================
// LedgerAI — Ask LedgerAI Server Actions (UX Corrective Phase)
// ------------------------------------------------------------
// Entrypoints for the Ask page: asking (with an optional conversation to
// continue) plus the tenant-scoped conversation CRUD. Every action folds
// unexpected errors into a user-safe DTO; AuthorizationError is re-thrown
// so the client can bounce to /login instead of guessing.
// ============================================================

import { askAssistantQuestion, type AskOutcome } from "@/lib/services/assistant";
import {
  listConversations,
  getConversationWithMessages,
  renameConversation,
  deleteConversation,
  deleteAllConversations,
  ConversationNotFoundError,
} from "@/lib/services/assistant-conversations";
import { isAskEnabled } from "@/lib/ask/config";
import { requireAuthContext, AuthorizationError } from "@/lib/services/auth-context";
import {
  consumeConfiguredLimit,
  RATE_LIMIT_EXCEEDED_MESSAGE,
} from "@/lib/security/rate-limit";
import type {
  ConversationMessage,
  ConversationSummary,
} from "@/lib/types/assistant";

export type AskAssistantReturn =
  | AskOutcome
  | { kind: "error"; text: string; conversationGone?: boolean };

/** Returned while the Ask surface is deliberately on hold (defence in depth). */
const ASK_DISABLED_TEXT = "Ask is not available yet.";

export async function askAssistant(
  question: string,
  conversationId?: string | null,
): Promise<AskAssistantReturn> {
  // Defence in depth: the v1 surface is on hold, so no action may run even if
  // a future entry point forgets the page-level gate.
  if (!isAskEnabled()) return { kind: "error", text: ASK_DISABLED_TEXT };
  try {
    const ctx = await requireAuthContext();
    const decision = await consumeConfiguredLimit("ask:chat", ctx.business.id);
    if (!decision.ok) {
      return { kind: "error", text: RATE_LIMIT_EXCEEDED_MESSAGE };
    }
    return await askAssistantQuestion(question, conversationId ?? null);
  } catch (error) {
    if (error instanceof AuthorizationError) throw error;
    if (error instanceof ConversationNotFoundError) {
      return {
        kind: "error",
        text: "That conversation is no longer available. Starting a fresh one.",
        conversationGone: true,
      };
    }
    return {
      kind: "error",
      text: "Sorry — I couldn't look into that right now. Please try again.",
    };
  }
}

export type ListConversationsResult =
  | { ok: true; conversations: ConversationSummary[] }
  | { ok: false };

export async function listConversationsAction(): Promise<ListConversationsResult> {
  if (!isAskEnabled()) return { ok: false };
  try {
    const conversations = await listConversations();
    return { ok: true, conversations };
  } catch (error) {
    if (error instanceof AuthorizationError) throw error;
    return { ok: false };
  }
}

export type GetConversationResult =
  | {
      ok: true;
      conversation: { id: string; title: string };
      messages: ConversationMessage[];
    }
  | { ok: false; gone: boolean };

export async function getConversationAction(
  conversationId: string,
): Promise<GetConversationResult> {
  if (!isAskEnabled()) return { ok: false, gone: false };
  try {
    const result = await getConversationWithMessages(conversationId);
    if (!result) return { ok: false, gone: true };
    return {
      ok: true,
      conversation: { id: result.id, title: result.title },
      messages: result.messages,
    };
  } catch (error) {
    if (error instanceof AuthorizationError) throw error;
    return { ok: false, gone: false };
  }
}

export async function renameConversationAction(
  conversationId: string,
  title: string,
): Promise<{ ok: boolean }> {
  if (!isAskEnabled()) return { ok: false };
  try {
    return await renameConversation(conversationId, title);
  } catch (error) {
    if (error instanceof AuthorizationError) throw error;
    return { ok: false };
  }
}

export async function deleteConversationAction(
  conversationId: string,
): Promise<{ ok: boolean }> {
  if (!isAskEnabled()) return { ok: false };
  try {
    return await deleteConversation(conversationId);
  } catch (error) {
    if (error instanceof AuthorizationError) throw error;
    return { ok: false };
  }
}

export async function deleteAllConversationsAction(): Promise<{ ok: boolean }> {
  if (!isAskEnabled()) return { ok: false };
  try {
    return await deleteAllConversations();
  } catch (error) {
    if (error instanceof AuthorizationError) throw error;
    return { ok: false };
  }
}