// ============================================================
// LedgerAI — Assistant conversation store (UX Corrective Phase)
// ------------------------------------------------------------
// Tenant-scoped persistence for Ask LedgerAI conversations. Every entry
// point derives `businessId` from requireAuthContext() (never from the
// client) and scopes every read/write/delete to that business, so one
// tenant can never see or affect another's history.
//
// Delete semantics: messages cascade off their conversation via the
// assistant_messages FK, so deletion is a single scoped deleteMany.
// ============================================================

import { z } from "zod";
import { requireAuthContext } from "@/lib/services/auth-context";
import { zErrorMessage } from "@/lib/validation/index";
import type { PrismaClient } from "@/generated/prisma/client";
import type { ConversationMessage, ConversationSummary } from "@/lib/types/assistant";
import type { AskV2TurnAnchor } from "@/lib/ask-v2/anchor";

/** Raised when a conversation id fails a business-scoped lookup. */
export class ConversationNotFoundError extends Error {
  constructor() {
    super("Conversation not found.");
    this.name = "ConversationNotFoundError";
  }
}

const titleSchema = z.string().trim().min(1).max(60);

/**
 * Newest-first conversation summaries for a business. The caller must have
 * already derived `businessId` from requireAuthContext() (never from the
 * client); used by the Ask page to seed the first-paint state server-side
 * without resolving the auth context a second time.
 */
export async function listConversationsForContext(
  prisma: PrismaClient,
  businessId: string,
): Promise<ConversationSummary[]> {
  const rows = await prisma.assistantConversation.findMany({
    where: { businessId },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, updatedAt: true },
  });
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    updatedAt: row.updatedAt.toISOString(),
  }));
}

/** Newest-first list of the current business's conversations. */
export async function listConversations(): Promise<ConversationSummary[]> {
  const { prisma, business } = await requireAuthContext();
  return listConversationsForContext(prisma, business.id);
}

/**
 * Load one conversation with its message transcript. Returns null when the
 * conversation doesn't exist OR belongs to a different business (the client
 * must treat both as "gone" and drop it from the list).
 */
export async function getConversationWithMessages(
  conversationId: string,
): Promise<{ id: string; title: string; messages: ConversationMessage[] } | null> {
  const { prisma, business } = await requireAuthContext();
  const conversation = await prisma.assistantConversation.findFirst({
    where: { id: conversationId, businessId: business.id },
    select: { id: true, title: true },
  });
  if (!conversation) return null;

  const messages = await prisma.assistantMessage.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, role: true, content: true, createdAt: true },
  });
  return {
    id: conversation.id,
    title: conversation.title,
    messages: messages.map((message) => ({
      id: message.id,
      role: message.role as ConversationMessage["role"],
      content: message.content,
      createdAt: message.createdAt.toISOString(),
    })),
  };
}

/**
 * The most recent exchange in an owned conversation — the BOUNDED slice of
 * conversational context the semantic layer may use to resolve a follow-up
 * ("What about last month?", "what if I reduced that by ₦50,000?"). The
 * caller has already derived the business id from requireAuthContext (never
 * the client); returning null means the conversation is missing or belongs
 * to another tenant, and the caller must NOT act on it.
 */
export async function findLastUserQuestionForContext(
  prisma: PrismaClient,
  businessId: string,
  conversationId: string,
): Promise<{
  content: string;
  createdAt: string;
  answer: string | null;
} | null> {
  const conversation = await prisma.assistantConversation.findFirst({
    where: { id: conversationId, businessId },
    select: { id: true },
  });
  if (!conversation) return null;

  const messages = await prisma.assistantMessage.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: "desc" },
    take: 2,
    select: { role: true, content: true, createdAt: true },
  });
  const userMessage = messages.find((m) => m.role === "user");
  const assistantMessage = messages.find((m) => m.role === "assistant");
  if (!userMessage) return null;
  return {
    content: userMessage.content,
    createdAt: userMessage.createdAt.toISOString(),
    answer: assistantMessage?.content ?? null,
  };
}

/**
 * The most recent OWNED exchanges (bounded window), newest first. Used to
 * re-anchor a follow-up that must walk back more than one turn — e.g. after
 * "Spending in August 2026 was ₦187,600" -> "breakdown of that" -> the user
 * says "the 187600" again. The caller has already derived the business id from
 * requireAuthContext; every read is scoped to that business.
 */
/**
 * One owned prior exchange: the user's question text, the assistant's final
 * displayed answer, and the raw assistant-message metadata (a Phase 9E ask-v2
 * verified turn anchor when one was written). `metadata` is unvalidated JSON —
 * callers must validate it before use (ask-v2 does, via parseAskV2Anchor).
 */
export interface OwnedExchange {
  content: string;
  answer: string | null;
  /** Raw assistant-message metadata; optional so legacy/unit mocks without it
   *  remain valid (the DB path always populates it, null when absent). */
  metadata?: unknown;
}

export async function findRecentOwnedExchanges(
  prisma: PrismaClient,
  businessId: string,
  conversationId: string,
): Promise<OwnedExchange[]> {
  const conversation = await prisma.assistantConversation.findFirst({
    where: { id: conversationId, businessId },
    select: { id: true },
  });
  if (!conversation) return [];

  const messages = await prisma.assistantMessage.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: "desc" },
    take: 4,
    select: { role: true, content: true, metadata: true },
  });

  // Desc order pairs each user message with the assistant message that
  // answered it (the assistant turn created just before the user's next turn).
  const exchanges: OwnedExchange[] = [];
  let pendingAnswer: string | null = null;
  let pendingMetadata: unknown = null;
  for (const message of messages) {
    if (message.role === "assistant") {
      pendingAnswer = message.content;
      pendingMetadata = message.metadata;
    } else if (message.role === "user") {
      exchanges.push({
        content: message.content,
        answer: pendingAnswer,
        metadata: pendingMetadata,
      });
      pendingAnswer = null;
      pendingMetadata = null;
    }
  }
  return exchanges;
}

/** Rename a conversation (scoped to the current business). */
export async function renameConversation(
  conversationId: string,
  title: string,
): Promise<{ ok: boolean }> {
  const parsed = titleSchema.safeParse(title);
  if (!parsed.success) throw new Error(zErrorMessage(parsed.error));

  const { prisma, business } = await requireAuthContext();
  const result = await prisma.assistantConversation.updateMany({
    where: { id: conversationId, businessId: business.id },
    data: { title: parsed.data },
  });
  return { ok: result.count > 0 };
}

/** Delete a single conversation (messages cascade in the database). */
export async function deleteConversation(
  conversationId: string,
): Promise<{ ok: boolean }> {
  const { prisma, business } = await requireAuthContext();
  const result = await prisma.assistantConversation.deleteMany({
    where: { id: conversationId, businessId: business.id },
  });
  return { ok: result.count > 0 };
}

/** Delete every conversation for the current business. */
export async function deleteAllConversations(): Promise<{ ok: boolean }> {
  const { prisma, business } = await requireAuthContext();
  await prisma.assistantConversation.deleteMany({
    where: { businessId: business.id },
  });
  return { ok: true };
}

export interface PersistExchangeResult {
  conversationId: string;
  userMessageId: string;
  assistantMessageId: string;
  created: boolean;
}

/**
 * Atomically persist one user -> assistant exchange. Creates the conversation
 * on first question (or continues when a valid, owned id is given). Touches
 * updatedAt so "most recent first" ordering reflects the latest turn.
 *
 * `anchor` (Phase 9E, optional) is the ask-v2 VERIFIED turn anchor derived
 * server-side from trusted execution data; it is written on the assistant row
 * in the SAME transaction. Omitted/null leaves metadata NULL (v1 /ask callers
 * and non-answer turns are unaffected).
 */
export async function persistAssistantExchange(
  prisma: PrismaClient,
  businessId: string,
  conversationId: string | null,
  title: string,
  question: string,
  answerText: string,
  anchor?: AskV2TurnAnchor | null,
): Promise<PersistExchangeResult> {
  return prisma.$transaction(async (tx) => {
    const conversation = conversationId
      ? await tx.assistantConversation.findFirst({
          where: { id: conversationId, businessId },
          select: { id: true, title: true },
        })
      : null;

    if (conversationId && !conversation) {
      throw new ConversationNotFoundError();
    }

    const existing = conversation ?? (await tx.assistantConversation.create({
      data: { businessId, title },
      select: { id: true, title: true },
    }));

    const userMessage = await tx.assistantMessage.create({
      data: { conversationId: existing.id, role: "user", content: question },
      select: { id: true },
    });
    const assistantMessage = await tx.assistantMessage.create({
      data: {
        conversationId: existing.id,
        role: "assistant",
        content: answerText,
        ...(anchor ? { metadata: anchor } : {}),
      },
      select: { id: true },
    });

    // Touch ordering timestamp. The title is re-applied unchanged only so the
    // update call has content; updatedAt is what the history actually sorts by.
    await tx.assistantConversation.update({
      where: { id: existing.id },
      data: { title: existing.title },
    });

    return {
      conversationId: existing.id,
      userMessageId: userMessage.id,
      assistantMessageId: assistantMessage.id,
      created: !conversationId,
    };
  });
}