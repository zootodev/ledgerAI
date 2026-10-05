"use client";

// ============================================================
// LedgerAI — Ask v2 chat shell (Phase 5)
// ------------------------------------------------------------
// The interactive surface for /ask-v2. The browser holds ONLY the local
// transcript and the server-issued conversationId (via the pure reducer in
// /lib/ask-v2/chat-state). Every answer comes from the askV2Ask server
// action — no client-side interpretation, finance math, or tenant ids.
// ============================================================

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { askV2Ask } from "@/app/ask-v2/actions";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { AskV2Transcript } from "@/components/ask-v2/ask-v2-transcript";
import { AskV2Composer } from "@/components/ask-v2/ask-v2-composer";
import {
  ASK_V2_CHAT_INITIAL_STATE,
  ASK_V2_GENERIC_ERROR_TEXT,
  askV2ChatReducer,
  buildAskV2Request,
  isAuthError,
} from "@/lib/ask-v2/chat-state";

export interface AskV2ChatProps {
  userName?: string;
  userEmail: string;
  businessName: string;
  currency: string;
  onSignOut?: () => void;
}

export function AskV2Chat({
  userName,
  userEmail,
  businessName,
  currency,
  onSignOut,
}: AskV2ChatProps) {
  const router = useRouter();
  const [state, dispatch] = React.useReducer(askV2ChatReducer, ASK_V2_CHAT_INITIAL_STATE);
  const [draft, setDraft] = React.useState("");

  // Keep the server-issued conversation id available to async submit without
  // capturing a stale dispatch-closure value.
  const requestRef = React.useRef(state.conversationId);
  React.useEffect(() => {
    requestRef.current = state.conversationId;
  }, [state.conversationId]);

  // Keep the transcript scrolled to the newest bubble.
  const endRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [state.messages, state.pending]);

  const submit = React.useCallback(async () => {
    const message = draft.trim();
    if (!message || state.pending) return;

    dispatch({ type: "submit", message });
    setDraft("");

    try {
      const request = buildAskV2Request(message, requestRef.current);
      const response = await askV2Ask(request);
      dispatch({
        type: "receive",
        text: response.text,
        conversationId: response.conversationId,
      });
    } catch (error) {
      // A vanished session must land on the login page, not hang the chat.
      if (isAuthError(error)) {
        dispatch({ type: "reset" });
        router.push("/login");
        return;
      }
      dispatch({ type: "error", text: ASK_V2_GENERIC_ERROR_TEXT });
    }
  }, [draft, state.pending, router]);

  return (
    <AppShell
      onSignOut={onSignOut}
      header={{
        title: "Ask LedgerAI (v2)",
        user: userName ? { name: userName, email: userEmail } : null,
      }}
    >
      <div className="mx-auto flex min-w-0 max-w-3xl flex-col gap-5 xl:h-[calc(100dvh-6.5rem)] xl:min-h-[30rem]">
        <div className="flex shrink-0 items-center justify-between gap-2">
          <p className="min-w-0 truncate text-sm text-muted">
            Ask questions about your business finances · {businessName} · {currency}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            leftIcon={<Plus className="h-4 w-4" aria-hidden="true" />}
            disabled={state.pending}
            onClick={() => {
              dispatch({ type: "reset" });
              setDraft("");
            }}
          >
            New conversation
          </Button>
        </div>

        <AskV2Transcript
          messages={state.messages}
          pending={state.pending}
          bottomRef={endRef}
          onExample={(text) => setDraft(text)}
        />

        <AskV2Composer
          value={draft}
          onChange={setDraft}
          onSubmit={() => void submit()}
          pending={state.pending}
        />
      </div>
    </AppShell>
  );
}