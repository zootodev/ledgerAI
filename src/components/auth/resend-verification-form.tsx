"use client";

import * as React from "react";
import { useActionState } from "react";
import Link from "next/link";
import { MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import {
  resendVerificationAction,
  type AuthFormState,
} from "@/lib/auth/actions";

const initialState: AuthFormState = {};

/** Seconds to wait between resend attempts, so a click can't be spammed. */
const RESEND_COOLDOWN_SECONDS = 30;

export interface ResendVerificationFormProps {
  initialEmail?: string;
  /** True when the page was opened right after a resend. */
  sent?: boolean;
}

/**
 * Resend-confirmation screen. Submits through the React action handler (Enter
 * in the field submits), the button is disabled while pending, and the success
 * copy is intentionally neutral so the screen never reveals whether an account
 * exists for the address.
 *
 * The inbox instruction is the primary message — that is what the visitor
 * actually needs to do — while the resend control is deliberately secondary
 * and rate-limited client-side.
 */
export function ResendVerificationForm({
  initialEmail = "",
  sent = false,
}: ResendVerificationFormProps) {
  const [state, formAction, pending] = useActionState(
    resendVerificationAction,
    initialState,
  );

  // Start the cooldown whenever the page was reached via a resend, then tick
  // it down. The timer lives in an effect, so a static render never schedules
  // one and the markup matches the server.
  const [cooldown, setCooldown] = React.useState(
    sent ? RESEND_COOLDOWN_SECONDS : 0,
  );

  React.useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  const handleResend = (event: React.FormEvent<HTMLFormElement>) => {
    // Still inside the cooldown: ignore the attempt instead of firing a
    // request the server would throttle anyway.
    if (cooldown > 0) {
      event.preventDefault();
      return;
    }
    setCooldown(RESEND_COOLDOWN_SECONDS);
  };

  return (
    <div>
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-soft text-brand">
        <MailCheck className="h-5 w-5" aria-hidden="true" />
      </span>
      <h1 className="mt-4 text-xl font-semibold text-foreground">
        Check your inbox (and spam) for the link
      </h1>
      <p className="mt-1 text-sm text-secondary">
        For your security you must confirm your email address before signing in.
        Open the link we emailed you{initialEmail ? ` to ${initialEmail}` : ""} —
        it can take a minute to arrive, so check your spam folder too.
      </p>

      <form
        action={formAction}
        onSubmit={handleResend}
        suppressHydrationWarning
        className="mt-6 flex flex-col gap-4"
      >
        {(state.error || sent) && (
          <Alert
            tone={state.error ? "danger" : "info"}
            title={state.error ? "Couldn't resend" : "Link sent"}
          >
            {state.error ?? "We sent a fresh confirmation link. It can take a minute to arrive."}
          </Alert>
        )}
        {state.success && (
          <Alert tone="success" title="Email sent">
            {state.success}
          </Alert>
        )}

        <Field label="Email" required htmlFor="email">
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            defaultValue={initialEmail}
            required
          />
        </Field>

        <Button
          type="submit"
          variant="outline"
          loading={pending}
          disabled={cooldown > 0}
          fullWidth
          className="mt-2"
        >
          Resend confirmation email
        </Button>
        {cooldown > 0 && (
          <p className="text-center text-sm text-muted" role="status">
            Resend available in {cooldown}s.
          </p>
        )}
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        Already confirmed?{" "}
        <Link href="/login" className="font-medium text-brand hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
