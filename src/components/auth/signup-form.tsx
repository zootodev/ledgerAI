"use client";

import * as React from "react";
import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { signupAction, type AuthFormState } from "@/lib/auth/actions";

const initialState: AuthFormState = {};

export function SignupForm() {
  const [state, formAction, pending] = useActionState(signupAction, initialState);

  return (
    <div>
      <h1 className="text-xl font-semibold text-foreground">Create your account</h1>
      <p className="mt-1 text-sm text-muted">
        Start turning your business records into clarity.
      </p>

      <form action={formAction} className="mt-6 flex flex-col gap-4">
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

        <Field label="Full name" htmlFor="name">
          <Input id="name" name="name" autoComplete="name" placeholder="Ngozi Adeyemi" />
        </Field>

        <Field label="Email" required htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" placeholder="you@example.com" required />
        </Field>

        <Field label="Password" required hint="At least 8 characters." htmlFor="password">
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            placeholder="••••••••"
            required
            minLength={8}
          />
        </Field>

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