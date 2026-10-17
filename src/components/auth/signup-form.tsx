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
import { signupAction, type AuthFormState } from "@/lib/auth/actions";

const initialState: AuthFormState = {};

/** Field-level error when the server-rejected message belongs to a field. */
function passwordFieldError(message: string | undefined): string | undefined {
  if (message && /password/i.test(message)) return message;
  return undefined;
}

export function SignupForm() {
  const [state, formAction, pending] = useActionState(signupAction, initialState);
  const passwordError = passwordFieldError(state.error);

  return (
    <div>
      <h1 className="text-xl font-semibold text-foreground">Create your account</h1>
      <p className="mt-1 text-sm text-muted">
        Import your first statement, review it once, and see your profit clearly.
      </p>
      <AuthValueStrip intent="signup" className="mt-4" />

      <form action={formAction} suppressHydrationWarning className="mt-6 flex flex-col gap-4">
        {state.error && (
          <Alert tone="danger" title="Couldn't create account">
            {state.error}
          </Alert>
        )}
        {state.success && (
          <Alert tone="success" title="Account created">
            {state.success}
          </Alert>
        )}
        {state.info && (
          <Alert tone="info" title="Check your inbox">
            {state.info}
          </Alert>
        )}

        <Field label="Full name" required htmlFor="name">
          <Input id="name" name="name" autoComplete="name" placeholder="Ngozi Adeyemi" required />
        </Field>

        <Field label="Email" required htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" placeholder="you@example.com" required />
        </Field>

        <PasswordField
          id="password"
          name="password"
          label="Password"
          hint="At least 10 characters. Avoid common passwords."
          error={passwordError}
          autoComplete="new-password"
          placeholder="Create a password"
          minLength={10}
          required
        />

        <label className="flex items-start gap-2 text-sm text-secondary">
          <input
            type="checkbox"
            name="acceptTerms"
            required
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-border text-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          />
          <span>
            I agree to the{" "}
            <Link href="/terms" className="font-medium text-brand hover:underline">
              Terms
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="font-medium text-brand hover:underline">
              Privacy Notice
            </Link>
            , and I have read how my data is handled.
          </span>
        </label>

        <Button type="submit" loading={pending} fullWidth className="mt-2">
          Create account
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-brand hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}