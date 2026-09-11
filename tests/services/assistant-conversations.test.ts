import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/services/auth-context", () => ({
  requireAuthContext: vi.fn(),
  AuthorizationError: class AuthorizationError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "AuthorizationError";
    }
  },
}));

import { requireAuthContext } from "@/lib/services/auth-context";
import {
  listConversations,
  getConversationWithMessages,
  renameConversation,
  deleteConversation,
  deleteAllConversations,
  persistAssistantExchange,
  ConversationNotFoundError,
} from "@/lib/services/assistant-conversations";

const userA = { id: "auth-user-a", email: "a@example.com", name: "User A" };
const businessA = { id: "biz-a", name: "A Ltd", currency: "NGN" };

const mockConversations = {
  findMany: vi.fn(),
  findFirst: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
  deleteMany: vi.fn(),
};

const mockMessages = {
  findMany: vi.fn(),
  create: vi.fn(),
};

const mockPrisma = {
  business: { findFirst: vi.fn() },
  assistantConversation: mockConversations,
  assistantMessage: mockMessages,
  $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockPrisma)),
};

const mockedRequireAuthContext = vi.mocked(requireAuthContext);

beforeEach(() => {
  vi.clearAllMocks();
  Object.values(mockConversations).forEach((fn) => {
    if (vi.isMockFunction(fn)) fn.mockReset();
  });
  Object.values(mockMessages).forEach((fn) => {
    if (vi.isMockFunction(fn)) fn.mockReset();
  });
  mockPrisma.business.findFirst.mockReset();
  mockedRequireAuthContext.mockReset();
  mockedRequireAuthContext.mockResolvedValue({
    user: userA,
    business: businessA,
    prisma: mockPrisma as never,
  });
});

describe("listConversations", () => {
  it("lists the business's conversations newest first", async () => {
    mockConversations.findMany.mockResolvedValueOnce([
      { id: "c2", title: "Profit — Last month", updatedAt: new Date("2026-08-10T10:00:00.000Z") },
      { id: "c1", title: "Income — This month", updatedAt: new Date("2026-08-01T10:00:00.000Z") },
    ]);

    const result = await listConversations();
    expect(result).toEqual([
      { id: "c2", title: "Profit — Last month", updatedAt: "2026-08-10T10:00:00.000Z" },
      { id: "c1", title: "Income — This month", updatedAt: "2026-08-01T10:00:00.000Z" },
    ]);

    const [args] = mockConversations.findMany.mock.calls[0];
    expect(args.where.businessId).toBe(businessA.id);
    expect(args.orderBy).toEqual({ updatedAt: "desc" });
  });
});

describe("getConversationWithMessages", () => {
  it("returns the transcript ordered oldest-first", async () => {
    mockConversations.findFirst.mockResolvedValueOnce({
      id: "c1",
      title: "Income — This month",
    });
    mockMessages.findMany.mockResolvedValueOnce([
      { id: "m1", role: "user", content: "How much income?", createdAt: new Date("2026-08-01T08:00:00.000Z") },
      { id: "m2", role: "assistant", content: "Income was ₦1,000,000.", createdAt: new Date("2026-08-01T08:00:01.000Z") },
    ]);

    const result = await getConversationWithMessages("c1");
    expect(result).toEqual({
      id: "c1",
      title: "Income — This month",
      messages: [
        { id: "m1", role: "user", content: "How much income?", createdAt: "2026-08-01T08:00:00.000Z" },
        { id: "m2", role: "assistant", content: "Income was ₦1,000,000.", createdAt: "2026-08-01T08:00:01.000Z" },
      ],
    });

    // Ownership: the id AND the session business must both match.
    const [convArgs] = mockConversations.findFirst.mock.calls[0];
    expect(convArgs.where).toEqual({ id: "c1", businessId: businessA.id });
    const [msgArgs] = mockMessages.findMany.mock.calls[0];
    expect(msgArgs.where.conversationId).toBe("c1");
    expect(msgArgs.orderBy).toEqual({ createdAt: "asc" });
  });

  it("returns null when the conversation is missing or belongs to another tenant", async () => {
    mockConversations.findFirst.mockResolvedValueOnce(null);
    const result = await getConversationWithMessages("c-foreign");
    expect(result).toBeNull();
    expect(mockMessages.findMany).not.toHaveBeenCalled();
  });
});

describe("renameConversation", () => {
  it("renames only an owned conversation", async () => {
    mockConversations.updateMany.mockResolvedValueOnce({ count: 1 });
    const result = await renameConversation("c1", "My new title");
    expect(result).toEqual({ ok: true });
    const [args] = mockConversations.updateMany.mock.calls[0];
    expect(args.where).toEqual({ id: "c1", businessId: businessA.id });
    expect(args.data.title).toBe("My new title");
  });

  it("reports ok:false when the conversation is not found", async () => {
    mockConversations.updateMany.mockResolvedValueOnce({ count: 0 });
    const result = await renameConversation("c1", "My new title");
    expect(result).toEqual({ ok: false });
  });

  it("rejects empty or over-long titles", async () => {
    await expect(renameConversation("c1", "  ")).rejects.toThrow();
    await expect(renameConversation("c1", "x".repeat(61))).rejects.toThrow();
  });
});

describe("deleteConversation", () => {
  it("deletes only an owned conversation", async () => {
    mockConversations.deleteMany.mockResolvedValueOnce({ count: 1 });
    const result = await deleteConversation("c1");
    expect(result).toEqual({ ok: true });
    const [args] = mockConversations.deleteMany.mock.calls[0];
    expect(args.where).toEqual({ id: "c1", businessId: businessA.id });
  });

  it("is idempotent for already-missing conversations", async () => {
    mockConversations.deleteMany.mockResolvedValueOnce({ count: 0 });
    const result = await deleteConversation("c-missing");
    expect(result).toEqual({ ok: false });
  });
});

describe("deleteAllConversations", () => {
  it("deletes the whole business's history with no id filter", async () => {
    mockConversations.deleteMany.mockResolvedValueOnce({ count: 3 });
    const result = await deleteAllConversations();
    expect(result).toEqual({ ok: true });
    const [args] = mockConversations.deleteMany.mock.calls[0];
    expect(args.where).toEqual({ businessId: businessA.id });
    expect("id" in args.where).toBe(false);
  });
});

describe("persistAssistantExchange", () => {
  it("creates a conversation and two messages atomically for a fresh chat", async () => {
    mockConversations.create.mockResolvedValueOnce({ id: "c-new", title: "Profit — Last month" });
    mockMessages.create.mockResolvedValueOnce({ id: "m-user" });
    mockMessages.create.mockResolvedValueOnce({ id: "m-assistant" });
    mockConversations.update.mockResolvedValueOnce({});

    const result = await persistAssistantExchange(
      mockPrisma as never,
      businessA.id,
      null,
      "Profit — Last month",
      "Did I make a profit?",
      "Net profit was ₦400,000.",
    );

    expect(result).toEqual({
      conversationId: "c-new",
      userMessageId: "m-user",
      assistantMessageId: "m-assistant",
      created: true,
    });

    expect(mockConversations.create).toHaveBeenCalledWith({
      data: { businessId: businessA.id, title: "Profit — Last month" },
      select: { id: true, title: true },
    });
    // Both messages land on the SAME conversation.
    expect(mockMessages.create).toHaveBeenNthCalledWith(1, {
      data: { conversationId: "c-new", role: "user", content: "Did I make a profit?" },
      select: { id: true },
    });
    expect(mockMessages.create).toHaveBeenNthCalledWith(2, {
      data: { conversationId: "c-new", role: "assistant", content: "Net profit was ₦400,000." },
      select: { id: true },
    });
    // Ordering touch bump.
    expect(mockConversations.update).toHaveBeenCalledWith({
      where: { id: "c-new" },
      data: { title: "Profit — Last month" },
    });
    // One transaction covers the whole exchange — no partial writes.
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("continues an existing owned conversation", async () => {
    mockConversations.findFirst.mockResolvedValueOnce({ id: "c1", title: "Profit — Last month" });
    mockMessages.create.mockResolvedValueOnce({ id: "m-user" });
    mockMessages.create.mockResolvedValueOnce({ id: "m-assistant" });
    mockConversations.update.mockResolvedValueOnce({});

    const result = await persistAssistantExchange(
      mockPrisma as never,
      businessA.id,
      "c1",
      "Profit — Last month",
      "And last month?",
      "Net profit in July was ₦300,000.",
    );

    expect(result).toEqual({
      conversationId: "c1",
      userMessageId: "m-user",
      assistantMessageId: "m-assistant",
      created: false,
    });
    expect(mockConversations.create).not.toHaveBeenCalled();
    const [args] = mockConversations.findFirst.mock.calls[0];
    expect(args.where).toEqual({ id: "c1", businessId: businessA.id });
    expect(mockMessages.create).toHaveBeenNthCalledWith(1, {
      data: { conversationId: "c1", role: "user", content: "And last month?" },
      select: { id: true },
    });
  });

  it("refuses to write into a missing or foreign conversation", async () => {
    mockConversations.findFirst.mockResolvedValueOnce(null);

    await expect(
      persistAssistantExchange(
        mockPrisma as never,
        businessA.id,
        "c-foreign",
        "Spending — This month",
        "Spending?",
        "Spending was ₦500,000.",
      ),
    ).rejects.toBeInstanceOf(ConversationNotFoundError);

    expect(mockMessages.create).not.toHaveBeenCalled();
    expect(mockConversations.create).not.toHaveBeenCalled();
  });

  it("serializes the conversation through one transaction even for continues", async () => {
    mockConversations.findFirst.mockResolvedValueOnce({ id: "c1", title: "Spending — This month" });
    mockMessages.create.mockResolvedValueOnce({ id: "m-user" });
    mockMessages.create.mockResolvedValueOnce({ id: "m-assistant" });
    mockConversations.update.mockResolvedValueOnce({});

    await persistAssistantExchange(
      mockPrisma as never,
      businessA.id,
      "c1",
      "Spending — This month",
      "Spending?",
      "Spending was ₦500,000.",
    );

    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
  });
});