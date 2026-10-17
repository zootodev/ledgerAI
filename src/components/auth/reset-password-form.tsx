"use client";

import * as React from "react";
import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { PasswordField } from "@/components/auth/password-field";
import { updatePasswordAction, type AuthFormState } from "@/lib/auth/actions";

const initialState: AuthFormState = {};

/** Map the server's single error string onto the field that caused it. */
function fieldErrors(
  message: string | undefined,
): { password?: string; confirm?: string } {
  if (!message) return {};
  if (/Passwords don't match/.test(message)) return { confirm: message };
  if (/password/i.test(message)) return { password: message };
  return {};
}

/**
 * Resolve the field-level copy for a server error.
 *
 * Form-level messages — anything carrying its own recovery action, such as the
 * 2FA step-up instruction — are rendered in the alert together with their link,
 * so they are never repeated under a field as well: the user reads the message
 * exactly once.
 */
export function resetFieldErrors(state: AuthFormState): {
  password?: string;
  confirm?: string;
} {
  if (state.errorAction) return {};
  return fieldErrors(state.error);
}

export function ResetPasswordForm() {
  const [state, formAction, pending] = useActionState(
    updatePasswordAction,
    initialState,
  );
  const { password, confirm } = resetFieldErrors(state);

  return (
    <div>
      <h1 className="text-xl font-semibold text-foreground">Set a new password</h1>
      <p className="mt-1 text-sm text-muted">
        Choose a new password with at least 10 characters. Avoid common
        passwords.
      </p>

      <form action={formAction} suppressHydrationWarning className="mt-6 flex flex-col gap-4">
        {state.error && (
          <Alert tone="danger" title="Couldn't update your password">
            {state.error}
            {state.errorAction && (
              <Link
                href={state.errorAction.href}
                className="mt-2 block font-medium text-brand hover:underline"
              >
                {state.errorAction.label}
              </Link>
            )}
          </Alert>
        )}
        {state.success && (
          <Alert tone="success" title="Password updated">
            {state.success}
          </Alert>
        )}

        <PasswordField
          id="password"
          name="password"
          label="New password"
          hint="At least 10 characters. Avoid common passwords."
          error={password}
          autoComplete="new-password"
          minLength={10}
        />

        <PasswordField
          id="confirm"
          name="confirm"
          label="Confirm new password"
          error={confirm}
          autoComplete="new-password"
        />

        <Button type="submit" loading={pending} fullWidth className="mt-2">
          Update password
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        <Link href="/login" className="font-medium text-brand hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}