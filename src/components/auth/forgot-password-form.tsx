"use client";

import * as React from "react";
import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { useAuthFieldErrors } from "@/components/auth/use-auth-field-errors";
import {
  fieldValue,
  validateEmail,
  type FieldValidators,
} from "@/lib/auth/form-validation";
import { forgotPasswordAction, type AuthFormState } from "@/lib/auth/actions";

const initialState: AuthFormState = {};

const FORGOT_VALIDATORS: FieldValidators = {
  email: (data) => validateEmail(fieldValue(data, "email")),
};

/** The server's only field-specific message for this form is the email one. */
function serverFieldErrors(message: string | undefined): Record<string, string> {
  if (message && /email/i.test(message)) return { email: message };
  return {};
}

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(
    forgotPasswordAction,
    initialState,
  );
  const { errors, formRef, onBlur, onSubmit } = useAuthFieldErrors(FORGOT_VALIDATORS);
  const emailError = serverFieldErrors(state.error).email ?? errors.email;

  return (
    <div>
      <h1 className="text-xl font-semibold text-foreground">Reset your password</h1>
      <p className="mt-1 text-sm text-muted">
        Enter the email you signed up with and we&apos;ll send you a reset link.
        The link expires after 24 hours — check spam if it doesn&apos;t arrive.
      </p>

      <form
        ref={formRef}
        action={formAction}
        noValidate
        onBlur={onBlur}
        onSubmit={onSubmit}
        suppressHydrationWarning
        className="mt-6 flex flex-col gap-4"
      >
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

        <Field label="Email" required htmlFor="email" error={emailError}>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            required
            invalid={Boolean(emailError)}
            aria-describedby={emailError ? "email-error" : undefined}
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
