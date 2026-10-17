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
  hasAcceptedTerms,
  validateEmail,
  validateName,
  validateNewPassword,
  validateTerms,
  type FieldValidators,
} from "@/lib/auth/form-validation";
import { signupAction, type AuthFormState } from "@/lib/auth/actions";

const initialState: AuthFormState = {};

/** Client-side checks, run on blur and on submit. Declared once so the hook
 *  keeps a stable identity and never re-creates its callbacks. */
const SIGNUP_VALIDATORS: FieldValidators = {
  name: (data) => validateName(fieldValue(data, "name")),
  email: (data) => validateEmail(fieldValue(data, "email")),
  password: (data) => validateNewPassword(fieldValue(data, "password")),
  acceptTerms: (data) => validateTerms(hasAcceptedTerms(data)),
};

/**
 * Server messages that unambiguously belong to a single field. Everything else
 * stays in the alert. The server remains the source of truth: where both are
 * present, its copy wins over the local check.
 */
function serverFieldErrors(message: string | undefined): Record<string, string> {
  if (!message) return {};
  if (/accept the Terms/i.test(message)) return { acceptTerms: message };
  if (/password/i.test(message)) return { password: message };
  return {};
}

export function SignupForm() {
  const [state, formAction, pending] = useActionState(signupAction, initialState);
  const { errors, formRef, onBlur, onSubmit } = useAuthFieldErrors(SIGNUP_VALIDATORS);
  const fromServer = serverFieldErrors(state.error);

  const nameError = errors.name;
  const emailError = errors.email;
  const passwordError = fromServer.password ?? errors.password;
  const termsError = fromServer.acceptTerms ?? errors.acceptTerms;

  return (
    <div>
      <h1 className="text-xl font-semibold text-foreground">Create your account</h1>
      <p className="mt-1 text-sm text-muted">
        Import your first statement, review it once, and see your profit clearly.
      </p>
      <AuthValueStrip intent="signup" className="mt-4" />

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

        <Field label="Full name" required htmlFor="name" error={nameError}>
          <Input
            id="name"
            name="name"
            autoComplete="name"
            placeholder="Ngozi Adeyemi"
            required
            invalid={Boolean(nameError)}
            aria-describedby={nameError ? "name-error" : undefined}
          />
        </Field>

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

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="acceptTerms"
            className="flex min-h-11 cursor-pointer items-start gap-2.5 py-1.5 text-sm text-secondary"
          >
            <input
              id="acceptTerms"
              type="checkbox"
              name="acceptTerms"
              required
              aria-invalid={termsError ? true : undefined}
              aria-describedby={termsError ? "acceptTerms-error" : undefined}
              className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded border-border accent-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
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
          {termsError && (
            <p id="acceptTerms-error" className="text-sm font-medium text-danger-strong">
              {termsError}
            </p>
          )}
        </div>

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
