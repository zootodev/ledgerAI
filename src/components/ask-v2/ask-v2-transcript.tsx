// ============================================================
// LedgerAI — Ask v2 transcript (presentational)
// ------------------------------------------------------------
// Renders the local transcript plus the empty state and the in-flight
// indicator. Pure presentational (no effects, no I/O) so it can be
// exercised with renderToStaticMarkup in unit tests. The empty-state
// prompts are examples ONLY: they are handed to the parent to fill the
// composer and still go through the askV2Ask server pipeline on submit.
// ============================================================

import * as React from "react";
import { Bot, Loader2, Sparkles } from "lucide-react";
import { ASK_V2_SUGGESTIONS, type AskV2ChatMessage } from "@/lib/ask-v2/chat-state";

export interface AskV2TranscriptProps {
  messages: AskV2ChatMessage[];
  /** True while one turn is in flight (renders the analyzing indicator). */
  pending: boolean;
  /** Called when the user picks an example prompt (fills the composer). */
  onExample: (text: string) => void;
  /** Attaches a sentinel at the end of the log; the shell auto-scrolls it. */
  bottomRef?: React.Ref<HTMLDivElement>;
}

export function AskV2Transcript({
  messages,
  pending,
  onExample,
  bottomRef,
}: AskV2TranscriptProps) {
  const hasMessages = messages.length > 0;

  return (
    <div
      role="log"
      aria-live="polite"
      aria-label="Conversation"
      className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto"
    >
      {!hasMessages && !pending ? (
        <div className="m-auto max-w-2xl space-y-6 px-4 py-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-surface-subtle">
            <Sparkles className="h-5 w-5 text-brand" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <p className="text-lg font-semibold tracking-tight text-foreground">
              Ask about your business finances.
            </p>
            <p className="mx-auto max-w-md text-sm text-muted">
              Every answer is computed from your verified records and validated
              before it is served — LedgerAI never guesses.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2.5">
            {ASK_V2_SUGGESTIONS.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => onExample(example)}
                className="rounded-field border border-border bg-surface px-3.5 py-2 text-sm text-secondary transition-colors hover:border-brand hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
              >
                {example}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <>
          {messages.map((message) =>
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
          {pending && (
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
        </>
      )}
      <div ref={bottomRef} aria-hidden="true" />
    </div>
  );
}