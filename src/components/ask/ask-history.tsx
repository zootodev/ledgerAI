// ============================================================
// LedgerAI — Ask LedgerAI history panel (presentational)
// ------------------------------------------------------------
// Renders the conversation list for the sidebar (>= xl) and the mobile/
// reduced-desktop drawer. Pure presentational: no portals, no effects, so it
// can be exercised with renderToStaticMarkup in unit tests.
// ============================================================

import * as React from "react";
import { MessageSquareText, PenLine, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils/cn";
import { groupConversationsByRecency } from "@/lib/ask/group-history";
import type { ConversationSummary } from "@/lib/types/assistant";

export interface AskHistoryListProps {
  conversations: ConversationSummary[];
  activeId: string | null;
  /** Disable switching while an exchange is in flight. */
  disabled?: boolean;
  /** Override the clock used for Today/Yesterday grouping (tests). */
  now?: Date;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  onNewChat: () => void;
  onSelect: (id: string) => void;
  onRename: (id: string) => void;
  onDelete: (id: string) => void;
  onDeleteAll: () => void;
}

export function AskHistoryList({
  conversations,
  activeId,
  disabled = false,
  now,
  loading = false,
  error = false,
  onRetry,
  onNewChat,
  onSelect,
  onRename,
  onDelete,
  onDeleteAll,
}: AskHistoryListProps) {
  const groups = groupConversationsByRecency(conversations, now ?? new Date());

  return (
    <div className="flex h-full min-h-0 flex-col">
      <p className="shrink-0 px-2 pb-1.5 text-xs font-medium uppercase tracking-wide text-subtle">
        Conversations
      </p>
      <div className="mb-3 shrink-0">
        <Button
          variant="outline"
          size="sm"
          fullWidth
          disabled={disabled}
          leftIcon={<Plus className="h-4 w-4" aria-hidden="true" />}
          onClick={onNewChat}
        >
          New chat
        </Button>
      </div>

      <nav aria-label="Conversation history" className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <div className="space-y-2 px-2 pt-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-5/6" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : error ? (
          <div className="px-2 py-4 text-center">
            <p className="text-sm text-muted">Couldn&apos;t load your history.</p>
            {onRetry && (
              <Button
                variant="link"
                size="sm"
                className="mt-1"
                onClick={onRetry}
              >
                Try again
              </Button>
            )}
          </div>
        ) : conversations.length === 0 ? (
          <div className="px-2 py-6 text-center">
            <MessageSquareText
              className="mx-auto h-5 w-5 text-subtle"
              aria-hidden="true"
            />
            <p className="mt-2 text-sm text-muted">No conversations yet.</p>
          </div>
        ) : (
          groups.map((group) => (
            <div key={group.label} className="mb-2">
              <p className="px-2 pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-muted">
                {group.label}
              </p>
              <ul className="space-y-0.5">
                {group.items.map((conversation) => {
                  const active = conversation.id === activeId;
                  return (
                    <li key={conversation.id}>
                      <div
                        className={cn(
                          "group flex items-center gap-1 rounded-field pr-1",
                          active
                            ? "bg-brand-soft"
                            : "transition-colors hover:bg-surface-subtle",
                        )}
                        aria-current={active ? "true" : undefined}
                      >
                        <button
                          type="button"
                          onClick={() => onSelect(conversation.id)}
                          disabled={disabled}
                          className={cn(
                            "flex min-w-0 flex-1 items-center gap-2 px-3 py-2.5 text-left transition-colors",
                            active ? "text-foreground" : "text-secondary",
                          )}
                        >
                          <MessageSquareText
                            className={cn(
                              "h-4 w-4 shrink-0",
                              active ? "text-brand" : "text-subtle",
                            )}
                            aria-hidden="true"
                          />
                          <span className="truncate text-sm">
                            {conversation.title}
                          </span>
                        </button>
                        <button
                          type="button"
                          aria-label={`Rename ${conversation.title}`}
                          disabled={disabled}
                          onClick={() => onRename(conversation.id)}
                          className="shrink-0 rounded-md p-1.5 text-subtle opacity-100 transition-colors hover:bg-surface-subtle hover:text-foreground focus-visible:opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100"
                        >
                          <PenLine className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Delete ${conversation.title}`}
                          disabled={disabled}
                          onClick={() => onDelete(conversation.id)}
                          className="shrink-0 rounded-md p-1.5 text-subtle opacity-100 transition-colors hover:bg-surface-subtle hover:text-danger focus-visible:opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </nav>

      {conversations.length > 0 && !loading && !error && (
        <div className="mt-3 shrink-0 border-t border-border pt-3">
          <Button
            variant="dangerOutline"
            size="sm"
            fullWidth
            disabled={disabled}
            leftIcon={<Trash2 className="h-4 w-4" aria-hidden="true" />}
            onClick={onDeleteAll}
          >
            Delete all conversations
          </Button>
        </div>
      )}
    </div>
  );
}