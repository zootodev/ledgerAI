"use client";

import * as React from "react";
import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { forgotPasswordAction, type AuthFormState } from "@/lib/auth/actions";

const initialState: AuthFormState = {};

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(
    forgotPasswordAction,
    initialState,
  );

  return (
    <div>
      <h1 className="text-xl font-semibold text-foreground">Reset your password</h1>
      <p className="mt-1 text-sm text-muted">
        Enter the email you signed up with and we&apos;ll send you a reset link.
      </p>

      <form action={formAction} suppressHydrationWarning className="mt-6 flex flex-col gap-4">
        {state.error && (
          <Alert tone="danger" title="Couldn't send the link">
            {state.error}
          </Alert>
        )}
        {state.success && (
          <Alert tone="success" title="Check your inbox">
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
            required
          />
        </Field>

        <Button type="submit" loading={pending} fullWidth className="mt-2">
          Send reset link
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        Remembered it?{" "}
        <Link href="/login" className="font-medium text-brand hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}