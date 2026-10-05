"use client";

import * as React from "react";
import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { updatePasswordAction, type AuthFormState } from "@/lib/auth/actions";

const initialState: AuthFormState = {};

export function ResetPasswordForm() {
  const [state, formAction, pending] = useActionState(
    updatePasswordAction,
    initialState,
  );

  return (
    <div>
      <h1 className="text-xl font-semibold text-foreground">Set a new password</h1>
      <p className="mt-1 text-sm text-muted">
        Choose a new password with at least 8 characters.
      </p>

      <form action={formAction} suppressHydrationWarning className="mt-6 flex flex-col gap-4">
        {state.error && (
          <Alert tone="danger" title="Couldn't update your password">
            {state.error}
          </Alert>
        )}
        {state.success && (
          <Alert tone="success" title="Password updated">
            {state.success}
          </Alert>
        )}

        <Field label="New password" required htmlFor="password">
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            placeholder="••••••••"
            minLength={8}
            required
          />
        </Field>

        <Field label="Confirm new password" required htmlFor="confirm">
          <Input
            id="confirm"
            name="confirm"
            type="password"
            autoComplete="new-password"
            placeholder="••••••••"
            minLength={8}
            required
          />
        </Field>

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