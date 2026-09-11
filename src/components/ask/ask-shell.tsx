"use client";

// ============================================================
// LedgerAI — Ask LedgerAI chat shell (Final UX Refinement + Perf pass)
// ------------------------------------------------------------
// Client-side chat against the persistent assistant actions.
// Conversations are tenant-scoped and stored in the DB; the sidebar (>= xl)
// or a drawer (below xl) lists them, and the transcript reloads from the
// server after every exchange. Unsupported questions are answered but never
// persisted; transient bubbles are local-only and cleared on switch.
//
// First paint comes from the server: the tenant-scoped conversation list is
// provided as a prop, so a business with ZERO conversations opens on a clean
// empty state ("Start a conversation with LedgerAI") with no composer, no
// suggestion chips, and no conversation/message queries. Clicking "Start new
// chat" opens the workspace; the conversation row is still only created in
// the database when the first question is answered.
// ============================================================

import * as React from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Bot, History, Loader2, Plus, Send } from "lucide-react";
import {
  askAssistant,
  deleteAllConversationsAction,
  deleteConversationAction,
  getConversationAction,
  listConversationsAction,
  renameConversationAction,
  type AskAssistantReturn,
} from "@/lib/actions/assistant";
import { AskHistoryList } from "@/components/ask/ask-history";
import { resolveAskFirstPaintState } from "@/lib/ask/ask-first-state";
import type { ConversationMessage, ConversationSummary } from "@/lib/types/assistant";

const SUGGESTIONS = [
  "What's my balance?",
  "What were my expenses last month?",
  "Did I make a profit this month?",
  "What was my top expense category?",
];

const COMPOSER_MAX_HEIGHT = 176;

let transientSeq = 0;
function localBubble(
  role: ConversationMessage["role"],
  content: string,
): ConversationMessage {
  transientSeq += 1;
  return { id: `local-${transientSeq}`, role, content, createdAt: new Date().toISOString() };
}

/** Session/Auth failures must land the user on /login, not hang the page. */
function isAuthError(error: unknown): boolean {
  return error instanceof Error && /authoriz|sign in|session|business/i.test(error.message);
}

export interface AskShellProps {
  userName?: string;
  userEmail: string;
  businessName: string;
  currency: string;
  onSignOut?: () => void;
  /** The tenant-scoped conversation list resolved on the server. */
  conversations: ConversationSummary[];
  /** Conversation to open on first paint (from the ?c= URL param). */
  initialConversationId?: string | null;
}

/** Ask LedgerAI page: persistent, tenant-scoped deterministic Q&A chat. */
export function AskShell({
  userName,
  userEmail,
  businessName,
  currency,
  onSignOut,
  conversations,
  initialConversationId = null,
}: AskShellProps) {
  const router = useRouter();
  const firstPaint = resolveAskFirstPaintState(conversations, initialConversationId);

  const [conversationsState, setConversations] =
    React.useState<ConversationSummary[]>(conversations);
  const [activeId, setActiveId] = React.useState<string | null>(firstPaint.activeId);
  const [showWorkspace, setShowWorkspace] = React.useState(firstPaint.showWorkspace);
  const [messages, setMessages] = React.useState<ConversationMessage[]>([]);
  const [transient, setTransient] = React.useState<ConversationMessage[]>([]);
  const [input, setInput] = React.useState("");
  const [isWide, setIsWide] = React.useState(true);
  const [isAsking, setIsAsking] = React.useState(false);
  const [loadingMessages, setLoadingMessages] = React.useState(false);
  const [historyError, setHistoryError] = React.useState(false);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [renameTarget, setRenameTarget] = React.useState<ConversationSummary | null>(null);
  const [renameValue, setRenameValue] = React.useState("");
  const [renamePending, setRenamePending] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<ConversationSummary | null>(null);
  const [deletePending, setDeletePending] = React.useState(false);
  const [deleteAllOpen, setDeleteAllOpen] = React.useState(false);
  const [deleteAllPending, setDeleteAllPending] = React.useState(false);

  const endRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);
  const loadedIdRef = React.useRef<string | null>(null);
  const activeIdRef = React.useRef<string | null>(activeId);

  React.useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  /** Keep the ?c= URL param in sync without pushing a full route change. */
  const syncUrlParam = React.useCallback((id: string | null) => {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("c", id);
    else url.searchParams.delete("c");
    router.replace(`${url.pathname}${url.search}`, { scroll: false });
  }, [router]);

  // A stale ?c= on a zero-conversation business is dropped on first paint so
  // it never triggers a load for a conversation that cannot exist.
  React.useEffect(() => {
    if (firstPaint.dropUrlId) syncUrlParam(null);
  }, [firstPaint.dropUrlId, syncUrlParam]);

  // Short placeholders keep the composer scroll/clip-free on mobile Safari,
  // where a long hint clips and can induce zoom. Swap at the same `sm`
  // breakpoint the layout uses (640px) so desktop keeps a fuller hint.
  React.useEffect(() => {
    const mq = window.matchMedia("(min-width: 640px)");
    const sync = () => setIsWide(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const reloadHistory = React.useCallback(async () => {
    try {
      const result = await listConversationsAction();
      if (result.ok) {
        setConversations(result.conversations);
        setHistoryError(false);
      } else {
        setHistoryError(true);
      }
    } catch (error) {
      if (isAuthError(error)) {
        router.push("/login");
        return;
      }
      setHistoryError(true);
    }
  }, [router]);

  const loadConversation = React.useCallback(
    async (id: string, force = false) => {
      if (!force && loadedIdRef.current === id) return;
      loadedIdRef.current = id;
      setLoadingMessages(true);
      try {
        const result = await getConversationAction(id);
        if (result.ok) {
          setMessages(result.messages);
        } else if (result.gone) {
          setMessages([]);
          setConversations((prev) => prev.filter((c) => c.id !== id));
          if (activeIdRef.current === id) {
            setActiveId(null);
            syncUrlParam(null);
          }
          setTransient((prev) => [
            ...prev,
            localBubble("assistant", "That conversation is no longer available."),
          ]);
        } else {
          setTransient((prev) => [
            ...prev,
            localBubble("assistant", "I couldn't load that conversation. Please try again."),
          ]);
        }
      } catch (error) {
        if (isAuthError(error)) {
          router.push("/login");
          return;
        }
        setTransient((prev) => [
          ...prev,
          localBubble("assistant", "I couldn't load that conversation. Please try again."),
        ]);
      } finally {
        setLoadingMessages(false);
      }
    },
    [router, syncUrlParam],
  );

  // Open the conversation referenced by ?c= (or reselects on change).
  React.useEffect(() => {
    if (activeId && loadedIdRef.current !== activeId) void loadConversation(activeId);
  }, [activeId, loadConversation]);

  // Auto-scroll the transcript log to the latest bubble.
  React.useEffect(() => {
    if (!showWorkspace) return;
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, transient, isAsking, loadingMessages, showWorkspace]);

  React.useEffect(() => {
    if (!isAsking) inputRef.current?.focus();
  }, [isAsking]);

  // Grow the composer up to COMPOSER_MAX_HEIGHT, then scroll inside it.
  React.useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, COMPOSER_MAX_HEIGHT)}px`;
  }, [input]);

  const startNewChat = React.useCallback(() => {
    setActiveId(null);
    activeIdRef.current = null;
    loadedIdRef.current = null;
    setMessages([]);
    setTransient([]);
    setInput("");
    setDrawerOpen(false);
    syncUrlParam(null);
    setShowWorkspace(true);
    // The composer mounts with the workspace; focus it after the paint.
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [syncUrlParam]);

  const selectConversation = React.useCallback(
    (id: string) => {
      setDrawerOpen(false);
      setShowWorkspace(true);
      if (id === activeIdRef.current) {
        void loadConversation(id, true);
        return;
      }
      setActiveId(id);
      activeIdRef.current = id;
      syncUrlParam(id);
      setTransient([]);
    },
    [loadConversation, syncUrlParam],
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const question = input.trim();
    if (!question || isAsking) return;

    setInput("");
    setTransient((prev) => [...prev, localBubble("user", question)]);
    setIsAsking(true);

    let answer: AskAssistantReturn;
    try {
      answer = await askAssistant(question, activeIdRef.current);
    } catch (error) {
      // A vanished session should land on the login page, not hang the chat.
      if (isAuthError(error)) {
        router.push("/login");
        return;
      }
      answer = {
        kind: "error",
        text: "Sorry — I couldn't look into that right now. Please try again.",
      };
    } finally {
      setIsAsking(false);
    }

    if (answer.kind === "error") {
      if (answer.conversationGone) {
        setConversations((prev) => prev.filter((c) => c.id !== activeIdRef.current));
        setActiveId(null);
        activeIdRef.current = null;
        loadedIdRef.current = null;
        setMessages([]);
        syncUrlParam(null);
      }
      setTransient((prev) => [...prev, localBubble("assistant", answer.text)]);
      return;
    }

    if (answer.kind === "unsupported") {
      // Not persisted — keep the answer in the local transcript only.
      setTransient((prev) => [...prev, localBubble("assistant", answer.text)]);
      return;
    }

    // Persisted: drop the local echo and trust the stored transcript.
    setTransient([]);
    const id = answer.conversationId;
    if (id === null) return;
    if (activeIdRef.current !== id) {
      setActiveId(id);
      activeIdRef.current = id;
      syncUrlParam(id);
      loadedIdRef.current = null;
    }
    await loadConversation(id, true);
    await reloadHistory();
    inputRef.current?.focus();
  }

  async function confirmRename() {
    if (!renameTarget) return;
    setRenamePending(true);
    try {
      const result = await renameConversationAction(renameTarget.id, renameValue);
      if (result.ok) {
        const title = renameValue.trim();
        setConversations((prev) =>
          prev.map((c) => (c.id === renameTarget.id ? { ...c, title } : c)),
        );
        setRenameTarget(null);
      }
    } catch (error) {
      if (isAuthError(error)) {
        router.push("/login");
        return;
      }
    } finally {
      setRenamePending(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeletePending(true);
    try {
      const result = await deleteConversationAction(deleteTarget.id);
      if (result.ok) {
        const deletedId = deleteTarget.id;
        setConversations((prev) => prev.filter((c) => c.id !== deletedId));
        if (activeIdRef.current === deletedId) {
          setActiveId(null);
          activeIdRef.current = null;
          loadedIdRef.current = null;
          setMessages([]);
          syncUrlParam(null);
          setTransient((prev) => [
            ...prev,
            localBubble("assistant", "Conversation deleted."),
          ]);
        }
        setDeleteTarget(null);
      }
    } catch (error) {
      if (isAuthError(error)) {
        router.push("/login");
        return;
      }
    } finally {
      setDeletePending(false);
    }
  }

  async function confirmDeleteAll() {
    setDeleteAllPending(true);
    try {
      const result = await deleteAllConversationsAction();
      if (result.ok) {
        setConversations([]);
        setActiveId(null);
        activeIdRef.current = null;
        loadedIdRef.current = null;
        setMessages([]);
        setTransient([]);
        setDeleteAllOpen(false);
        syncUrlParam(null);
        inputRef.current?.focus();
      }
    } catch (error) {
      if (isAuthError(error)) {
        router.push("/login");
        return;
      }
    } finally {
      setDeleteAllPending(false);
    }
  }

  const busy = isAsking || loadingMessages;
  const rendered = [...messages, ...transient];

  const historyProps = {
    conversations: conversationsState,
    activeId,
    disabled: busy,
    loading: false,
    error: historyError,
    onRetry: () => void reloadHistory(),
    onNewChat: startNewChat,
    onSelect: selectConversation,
    onRename: (id: string) => {
      const target = conversationsState.find((c) => c.id === id) ?? null;
      if (target) {
        setRenameTarget(target);
        setRenameValue(target.title);
      }
    },
    onDelete: (id: string) => {
      const target = conversationsState.find((c) => c.id === id) ?? null;
      if (target) setDeleteTarget(target);
    },
    onDeleteAll: () => setDeleteAllOpen(true),
  };

  return (
    <AppShell
      onSignOut={onSignOut}
      header={{
        title: "Ask LedgerAI",
        user: userName ? { name: userName, email: userEmail } : null,
      }}
    >
      <div className="mx-auto flex w-full min-w-0 max-w-7xl flex-col gap-4 xl:h-[calc(100dvh-6.5rem)] xl:min-h-[30rem] xl:flex-row xl:items-stretch xl:gap-6">
        <aside className="hidden shrink-0 xl:block">
          <div className="flex h-full w-64 flex-col overflow-hidden px-1 py-2">
            <AskHistoryList {...historyProps} />
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col gap-5">
          <div className="flex shrink-0 items-center justify-between gap-2">
            <p className="min-w-0 truncate text-sm text-muted">
              Ask questions about your business finances · {businessName} · {currency}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 xl:hidden"
              leftIcon={<History className="h-4 w-4" aria-hidden="true" />}
              onClick={() => setDrawerOpen(true)}
            >
              History
            </Button>
          </div>

          {showWorkspace ? (
            <>
              <div
                ref={endRef}
                role="log"
                aria-live="polite"
                aria-label="Conversation"
                className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto"
              >
                {messages.length === 0 &&
                  transient.length === 0 &&
                  !loadingMessages && (
                    <div className="m-auto max-w-2xl space-y-6 px-4 text-center">
                      <p className="text-lg font-semibold tracking-tight text-foreground">
                        Ask about your business finances.
                      </p>
                      <div className="flex flex-wrap items-center justify-center gap-2.5">
                        {SUGGESTIONS.map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => {
                              setInput(s);
                              inputRef.current?.focus();
                            }}
                            className="rounded-field border border-border bg-surface px-3.5 py-2 text-sm text-secondary transition-colors hover:border-brand hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                {loadingMessages &&
                  messages.length === 0 &&
                  transient.length === 0 && (
                    <div className="flex items-start gap-3">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-subtle">
                        <Bot className="h-3.5 w-3.5 text-brand" aria-hidden="true" />
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                        Loading conversation…
                      </div>
                    </div>
                  )}

                {rendered.map((message) =>
                  message.role === "user" ? (
                    <div key={message.id} className="flex justify-end">
                      <div className="max-w-[80%] whitespace-pre-wrap rounded-xl bg-brand px-4 py-2.5 text-sm leading-6 text-on-accent">
                        {message.content}
                      </div>
                    </div>
                  ) : (
                    <div key={message.id} className="flex items-start gap-3">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-subtle">
                        <Bot className="h-3.5 w-3.5 text-brand" aria-hidden="true" />
                      </div>
                      <div className="min-w-0 max-w-[70ch] whitespace-pre-wrap pt-1 leading-relaxed text-foreground">
                        {message.content}
                      </div>
                    </div>
                  ),
                )}

                {isAsking && (
                  <div className="flex items-start gap-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-subtle">
                      <Bot className="h-3.5 w-3.5 text-brand" aria-hidden="true" />
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      Analyzing your books…
                    </div>
                  </div>
                )}
              </div>

              <form onSubmit={submit} className="shrink-0">
                <div className="flex items-end gap-2.5 rounded-field border border-border-strong bg-surface p-2.5 transition-colors focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/30">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        if (input.trim() && !isAsking) {
                          e.currentTarget.form?.requestSubmit();
                        }
                      }
                    }}
                    rows={1}
                    maxLength={500}
                    placeholder={isWide ? "Ask about your finances…" : "Ask a question…"}
                    aria-label="Ask about your business"
                    disabled={isAsking}
                    className="min-h-[44px] min-w-0 max-h-[176px] flex-1 resize-none bg-transparent px-2 py-2.5 text-base leading-6 text-foreground placeholder:text-sm placeholder:text-subtle focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 sm:placeholder:text-base"
                  />
                  <Button
                    type="submit"
                    size="lg"
                    loading={isAsking}
                    disabled={isAsking || !input.trim()}
                    leftIcon={<Send className="h-4 w-4" aria-hidden="true" />}
                  >
                    Ask
                  </Button>
                </div>
                <div className="mt-2 hidden items-center justify-between gap-4 px-1 text-xs text-subtle sm:flex">
                  <p>
                    Every answer is computed from your verified data — LedgerAI never guesses.
                  </p>
                  {input.trim() && (
                    <p className="shrink-0">Enter to send · Shift+Enter for a new line</p>
                  )}
                </div>
              </form>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center px-4 py-16">
              <div className="max-w-md space-y-6 text-center">
                <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                  Start a conversation with LedgerAI
                </h2>
                <p className="mx-auto max-w-sm text-muted">
                  Ask about your business finances and get precise answers from your
                  recorded transactions.
                </p>
                <Button
                  size="lg"
                  leftIcon={<Plus className="h-4 w-4" aria-hidden="true" />}
                  onClick={startNewChat}
                >
                  Start new chat
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="Conversations"
        description="Your saved history"
        side="left"
      >
        <div className="flex h-full min-h-0 flex-col">
          <AskHistoryList {...historyProps} />
        </div>
      </Drawer>

      <Modal
        open={renameTarget !== null}
        onClose={() => !renamePending && setRenameTarget(null)}
        title="Rename conversation"
        description="Give this conversation a clearer name."
        size="sm"
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => setRenameTarget(null)}
              disabled={renamePending}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void confirmRename()}
              loading={renamePending}
              disabled={renameValue.trim().length === 0}
            >
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-2">
          <Label htmlFor="conversation-title">Title</Label>
          <Input
            id="conversation-title"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            maxLength={60}
            onKeyDown={(e) => {
              if (e.key === "Enter" && renameValue.trim().length > 0) {
                e.preventDefault();
                void confirmRename();
              }
            }}
          />
        </div>
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => !deletePending && setDeleteTarget(null)}
        onConfirm={() => void confirmDelete()}
        title="Delete conversation?"
        description={
          deleteTarget
            ? `“${deleteTarget.title}” and its messages will be permanently removed.`
            : undefined
        }
        pending={deletePending}
        confirmLabel="Delete"
      />

      <ConfirmDialog
        open={deleteAllOpen}
        onClose={() => !deleteAllPending && setDeleteAllOpen(false)}
        onConfirm={() => void confirmDeleteAll()}
        title="Delete all conversations?"
        description={
          conversationsState.length > 0
            ? `All ${conversationsState.length} conversation${conversationsState.length === 1 ? "" : "s"} will be permanently removed.`
            : undefined
        }
        pending={deleteAllPending}
        confirmLabel="Delete all"
      />
    </AppShell>
  );
}