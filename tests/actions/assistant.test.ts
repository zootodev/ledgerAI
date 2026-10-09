import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/services/assistant", () => ({
  askAssistantQuestion: vi.fn(),
}));

vi.mock("@/lib/services/assistant-conversations", () => {
  class ConversationNotFoundError extends Error {
    constructor() {
      super("Conversation not found.");
      this.name = "ConversationNotFoundError";
    }
  }
  return {
    listConversations: vi.fn(),
    getConversationWithMessages: vi.fn(),
    renameConversation: vi.fn(),
    deleteConversation: vi.fn(),
    deleteAllConversations: vi.fn(),
    ConversationNotFoundError,
  };
});

vi.mock("@/lib/services/auth-context", () => ({
  requireAuthContext: vi.fn(),
  AuthorizationError: class AuthorizationError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "AuthorizationError";
    }
  },
}));

const rateLimitMocks = vi.hoisted(() => ({
  consumeConfiguredLimit: vi.fn(async () => ({ ok: true, remaining: 30, retryAfterSeconds: 0 })),
}));

vi.mock("@/lib/security/rate-limit", () => ({
  ...rateLimitMocks,
  RATE_LIMIT_EXCEEDED_MESSAGE: "Too many requests. Please slow down and try again shortly.",
}));

import {
  askAssistant,
  listConversationsAction,
  getConversationAction,
  renameConversationAction,
  deleteConversationAction,
  deleteAllConversationsAction,
} from "@/lib/actions/assistant";
import { askAssistantQuestion } from "@/lib/services/assistant";
import {
  listConversations,
  getConversationWithMessages,
  renameConversation,
  deleteConversation,
  deleteAllConversations,
  ConversationNotFoundError,
} from "@/lib/services/assistant-conversations";
import { requireAuthContext, AuthorizationError } from "@/lib/services/auth-context";
import { consumeConfiguredLimit as consumeConfiguredLimitMock } from "@/lib/security/rate-limit";

const mockAskAssistantQuestion = vi.mocked(askAssistantQuestion);
const mockRequireAuthContext = vi.mocked(requireAuthContext);
const mockListConversations = vi.mocked(listConversations);
const mockGetConversation = vi.mocked(getConversationWithMessages);
const mockRename = vi.mocked(renameConversation);
const mockDelete = vi.mocked(deleteConversation);
const mockDeleteAll = vi.mocked(deleteAllConversations);

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuthContext.mockReset();
  mockRequireAuthContext.mockResolvedValue({
    user: { id: "u-1", email: "a@example.com" },
    business: { id: "biz-1", name: "A Ltd", currency: "NGN" },
    prisma: {} as never,
  });
  rateLimitMocks.consumeConfiguredLimit.mockResolvedValue({
    ok: true,
    remaining: 29,
    retryAfterSeconds: 0,
  });
  mockAskAssistantQuestion.mockReset();
  mockListConversations.mockReset();
  mockGetConversation.mockReset();
  mockRename.mockReset();
  mockDelete.mockReset();
  mockDeleteAll.mockReset();
});

describe("askAssistant (server action)", () => {
  it("forwards the question and conversation id to the service", async () => {
    mockAskAssistantQuestion.mockResolvedValue({
      kind: "answer",
      text: "Income in August 2026 was ₦1,000,000.",
      conversationId: "conv-1",
      userMessageId: "um-1",
      assistantMessageId: "am-1",
    });
    const result = await askAssistant("How much income?", "conv-1");
    expect(result.kind).toBe("answer");
    expect(mockAskAssistantQuestion).toHaveBeenCalledWith("How much income?", "conv-1");
  });

  it("defaults the conversation id to null for a fresh chat", async () => {
    mockAskAssistantQuestion.mockResolvedValue({
      kind: "answer",
      text: "Spending in August 2026 was ₦1,000,000.",
      conversationId: "conv-new",
      userMessageId: "um-1",
      assistantMessageId: "am-1",
    });
    await askAssistant("How much did I spend?", undefined);
    expect(mockAskAssistantQuestion).toHaveBeenCalledWith("How much did I spend?", null);
  });

  it("folds unexpected errors into a user-safe DTO", async () => {
    mockAskAssistantQuestion.mockRejectedValue(new Error("db exploded"));
    const result = await askAssistant("How much income?");
    expect(result.kind).toBe("error");
    expect(result.text).toContain("try again");
    expect("conversationGone" in result ? result.conversationGone : undefined).toBeUndefined();
  });

  it("maps a vanished conversation to a gone signal", async () => {
    mockAskAssistantQuestion.mockRejectedValue(
      new ConversationNotFoundError(),
    );
    const result = await askAssistant("How much income?", "conv-old");
    expect(result.kind).toBe("error");
    if (result.kind === "error") expect(result.conversationGone).toBe(true);
  });

  it("rethrows authorization errors so the caller can redirect", async () => {
    mockAskAssistantQuestion.mockRejectedValue(
      new AuthorizationError("You must be signed in."),
    );
    await expect(askAssistant("How much income?")).rejects.toBeInstanceOf(
      AuthorizationError,
    );
  });

  it("returns a rate-limit error instead of calling the assistant", async () => {
    rateLimitMocks.consumeConfiguredLimit.mockResolvedValue({
      ok: false,
      remaining: 0,
      retryAfterSeconds: 42,
    });

    const result = await askAssistant("How much income?");

    expect(result).toEqual({ kind: "error", text: "Too many requests. Please slow down and try again shortly." });
    expect(mockAskAssistantQuestion).not.toHaveBeenCalled();
    expect(consumeConfiguredLimitMock).toHaveBeenCalledWith("ask:chat", "biz-1");
  });
});

describe("conversation list/get actions", () => {
  it("lists conversations newest first", async () => {
    mockListConversations.mockResolvedValue([
      { id: "c2", title: "Profit — Last month", updatedAt: new Date().toISOString() },
    ]);
    const result = await listConversationsAction();
    expect(result).toEqual({
      ok: true,
      conversations: [{ id: "c2", title: "Profit — Last month", updatedAt: expect.any(String) }],
    });
  });

  it("folds history load errors into an ok:false result", async () => {
    mockListConversations.mockRejectedValue(new Error("db exploded"));
    const result = await listConversationsAction();
    expect(result).toEqual({ ok: false });
  });

  it("rethrows authorization errors for the history action", async () => {
    mockListConversations.mockRejectedValue(new AuthorizationError("No business"));
    await expect(listConversationsAction()).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("returns a full transcript for an owned conversation", async () => {
    mockGetConversation.mockResolvedValue({
      id: "c1",
      title: "Income — This month",
      messages: [
        { id: "m1", role: "user", content: "How much income?", createdAt: "2026-08-01T08:00:00.000Z" },
        { id: "m2", role: "assistant", content: "Income was ₦1,000,000.", createdAt: "2026-08-01T08:00:01.000Z" },
      ],
    });
    const result = await getConversationAction("c1");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.messages).toHaveLength(2);
  });

  it("marks a missing or foreign conversation as gone", async () => {
    mockGetConversation.mockResolvedValue(null);
    const result = await getConversationAction("c-foreign");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.gone).toBe(true);
  });

  it("rethrows authorization errors for the get action", async () => {
    mockGetConversation.mockRejectedValue(new AuthorizationError("No business"));
    await expect(getConversationAction("c1")).rejects.toBeInstanceOf(AuthorizationError);
  });
});

describe("conversation mutation actions", () => {
  it("reports the rename outcome", async () => {
    mockRename.mockResolvedValue({ ok: true });
    const result = await renameConversationAction("c1", "My new title");
    expect(result).toEqual({ ok: true });
    expect(mockRename).toHaveBeenCalledWith("c1", "My new title");
  });

  it("folds rename errors into ok:false", async () => {
    mockRename.mockRejectedValue(new Error("bad title"));
    const result = await renameConversationAction("c1", "x");
    expect(result).toEqual({ ok: false });
  });

  it("reports the delete outcome", async () => {
    mockDelete.mockResolvedValue({ ok: true });
    const result = await deleteConversationAction("c1");
    expect(result).toEqual({ ok: true });
  });

  it("folds delete errors into ok:false", async () => {
    mockDelete.mockRejectedValue(new Error("db exploded"));
    const result = await deleteConversationAction("c1");
    expect(result).toEqual({ ok: false });
  });

  it("deletes all conversations for the business", async () => {
    mockDeleteAll.mockResolvedValue({ ok: true });
    const result = await deleteAllConversationsAction();
    expect(result).toEqual({ ok: true });
  });

  it("rethrows authorization errors from mutations", async () => {
    mockDelete.mockRejectedValue(new AuthorizationError("No business"));
    await expect(deleteConversationAction("c1")).rejects.toBeInstanceOf(AuthorizationError);
  });
});