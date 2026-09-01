"use client";

import * as React from "react";
import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { loginAction, type AuthFormState } from "@/lib/auth/actions";

const initialState: AuthFormState = {};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <div>
      <h1 className="text-xl font-semibold text-foreground">Sign in</h1>
      <p className="mt-1 text-sm text-muted">
        Welcome back to LedgerAI.
      </p>

      <form action={formAction} suppressHydrationWarning className="mt-6 flex flex-col gap-4">
        {state.error && (
          <Alert tone="danger" title="Couldn't sign in">
            {state.error}
          </Alert>
        )}

        <Field label="Email" required htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" placeholder="you@example.com" required />
        </Field>

        <Field label="Password" required htmlFor="password">
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            required
          />
        </Field>

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