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
 */
export function ResendVerificationForm({
  initialEmail = "",
  sent = false,
}: ResendVerificationFormProps) {
  const [state, formAction, pending] = useActionState(
    resendVerificationAction,
    initialState,
  );

  return (
    <div>
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-soft text-brand">
        <MailCheck className="h-5 w-5" aria-hidden="true" />
      </span>
      <h1 className="mt-4 text-xl font-semibold text-foreground">
        Confirm your email
      </h1>
      <p className="mt-1 text-sm text-muted">
        For your security you must confirm your email address before signing in.
        Open the link we emailed you, or send a new one below.
      </p>

      <form action={formAction} suppressHydrationWarning className="mt-6 flex flex-col gap-4">
        {(state.error || sent) && (
          <Alert tone={state.error ? "danger" : "info"} title={state.error ? "Couldn't resend" : "Check your inbox"}>
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

        <Button type="submit" loading={pending} fullWidth className="mt-2">
          Resend confirmation email
        </Button>
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
