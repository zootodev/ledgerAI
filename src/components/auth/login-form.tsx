"use client";

import * as React from "react";
import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { PasswordField } from "@/components/auth/password-field";
import { AuthValueStrip } from "@/components/auth/auth-value-strip";
import { useAuthFieldErrors } from "@/components/auth/use-auth-field-errors";
import {
  fieldValue,
  validateCurrentPassword,
  validateEmail,
  type FieldValidators,
} from "@/lib/auth/form-validation";
import { loginAction, type AuthFormState } from "@/lib/auth/actions";

const initialState: AuthFormState = {};

/**
 * Sign-in validation is intentionally lenient: accounts created before the
 * current password policy may be shorter than the signup minimum, so the
 * password is only checked for presence. A "must be 10 characters" message must
 * never appear on this form.
 */
const LOGIN_VALIDATORS: FieldValidators = {
  email: (data) => validateEmail(fieldValue(data, "email")),
  password: (data) => validateCurrentPassword(fieldValue(data, "password")),
};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initialState);
  const { errors, formRef, onBlur, onSubmit } = useAuthFieldErrors(LOGIN_VALIDATORS);

  return (
    <div>
      <h1 className="text-xl font-semibold text-foreground">Sign in</h1>
      <p className="mt-1 text-sm text-muted">
        Review your imports and keep your profit picture clear.
      </p>
      <AuthValueStrip intent="login" className="mt-4" />

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
          <Alert tone="danger" title="Couldn't sign in">
            {state.error}
          </Alert>
        )}

        <Field label="Email" required htmlFor="email" error={errors.email}>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            required
            invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? "email-error" : undefined}
          />
        </Field>

        <PasswordField
          id="password"
          name="password"
          label="Password"
          error={errors.password}
          autoComplete="current-password"
          required
        />

        <div className="-mt-1 text-right">
          <Link
            href="/forgot-password"
            className="text-sm font-medium text-brand hover:underline"
          >
            Forgot your password?
          </Link>
        </div>

        <Button type="submit" loading={pending} fullWidth className="mt-2">
          Sign in
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="font-medium text-brand hover:underline">
          Create one
        </Link>
      </p>
    </div>
  );
}
