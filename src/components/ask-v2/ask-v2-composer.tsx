// ============================================================
// LedgerAI — Ask v2 composer (presentational)
// ------------------------------------------------------------
// The message input row. Pure presentational surface: it knows nothing
// about finance or the pipeline — it only collects text and submits the
// whole thing to the parent, which sends it to the askV2Ask server action.
// Disables itself while a turn is in flight so duplicates can't be sent.
// ============================================================

import * as React from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export const ASK_V2_MESSAGE_MAX_LENGTH = 2000;
const COMPOSER_MAX_HEIGHT = 176;

export interface AskV2ComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  pending: boolean;
}

export function AskV2Composer({ value, onChange, onSubmit, pending }: AskV2ComposerProps) {
  const inputRef = React.useRef<HTMLTextAreaElement>(null);

  // Grow the composer up to COMPOSER_MAX_HEIGHT, then scroll inside it.
  React.useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, COMPOSER_MAX_HEIGHT)}px`;
  }, [value]);

  return (
    <form
      className="shrink-0"
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim() && !pending) onSubmit();
      }}
    >
      <div className="flex items-end gap-2.5 rounded-field border border-border-strong bg-surface p-2.5 transition-colors focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/30">
        <Label htmlFor="ask-v2-message" className="sr-only">
          Ask about your business finances
        </Label>
        <textarea
          ref={inputRef}
          id="ask-v2-message"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (value.trim() && !pending) e.currentTarget.form?.requestSubmit();
            }
          }}
          rows={1}
          maxLength={ASK_V2_MESSAGE_MAX_LENGTH}
          placeholder="Ask about your finances…"
          disabled={pending}
          className="min-h-[44px] max-h-[176px] min-w-0 flex-1 resize-none bg-transparent px-2 py-2.5 text-base leading-6 text-foreground placeholder:text-sm placeholder:text-subtle focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 sm:placeholder:text-base"
        />
        <Button
          type="submit"
          size="lg"
          loading={pending}
          disabled={pending || !value.trim()}
          leftIcon={<Send className="h-4 w-4" aria-hidden="true" />}
        >
          Send
        </Button>
      </div>
      <div className="mt-2 hidden items-center justify-between gap-4 px-1 text-xs text-subtle sm:flex">
        <p>Every answer is computed from your verified data — LedgerAI never guesses.</p>
        {value.trim() && !pending && (
          <p className="shrink-0">Enter to send · Shift+Enter for a new line</p>
        )}
      </div>
    </form>
  );
}