"use client";

import * as React from "react";
import { useActionState } from "react";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import {
  verifyMfaAction,
  signOutAction,
  type MfaFormState,
} from "@/lib/auth/actions";

const initialState: MfaFormState = {};

export interface MfaChallengeFormProps {
  /** Internal path to continue to after a successful challenge. */
  next: string;
  email: string;
}

/**
 * Login-time second-factor challenge. Submits through the same React action
 * handler as the button (Enter in the code field triggers it), and the button
 * is disabled while the request is in flight so a code can't be double-spent.
 * A sign-out escape is always available for a user who has lost their device.
 */
export function MfaChallengeForm({ next, email }: MfaChallengeFormProps) {
  const [state, formAction, pending] = useActionState(verifyMfaAction, initialState);

  return (
    <div>
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-soft text-brand">
        <ShieldCheck className="h-5 w-5" aria-hidden="true" />
      </span>
      <h1 className="mt-4 text-xl font-semibold text-foreground">
        Two-step verification
      </h1>
      <p className="mt-1 text-sm text-muted">
        Enter the 6-digit code from your authenticator app to finish signing in
        {email ? ` as ${email}` : ""}.
      </p>

      <form action={formAction} suppressHydrationWarning className="mt-6 flex flex-col gap-4">
        {state.error && (
          <Alert tone="danger" title="We couldn't verify that code">
            {state.error}
          </Alert>
        )}

        <input type="hidden" name="next" value={next} />

        <Field id="code" label="Authentication code">
          <Input
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            placeholder="123456"
            autoFocus
            required
            invalid={Boolean(state.error)}
            className="tracking-[0.4em]"
          />
        </Field>

        <Button type="submit" fullWidth loading={pending}>
          Verify and continue
        </Button>
      </form>

      <form action={signOutAction} className="mt-3">
        <Button type="submit" variant="ghost" fullWidth>
          Sign out
        </Button>
      </form>
    </div>
  );
}
