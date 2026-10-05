"use client";

import * as React from "react";
import { useActionState } from "react";
import { User } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import {
  updateProfileAction,
  type SettingsActionState,
} from "@/lib/actions/profile";

const initialState: SettingsActionState = {};

export interface ProfileSettingsProps {
  initialName: string;
  email: string;
}

export function ProfileSettings({ initialName, email }: ProfileSettingsProps) {
  const [state, formAction, pending] = useActionState(
    updateProfileAction,
    initialState,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription>
          Your display name is used across LedgerAI. Your email is your sign-in
          identity and cannot be changed here.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="max-w-md space-y-4">
          {state.error && (
            <Alert tone="danger" title="Couldn't save your profile">
              {state.error}
            </Alert>
          )}
          {state.ok && (
            <Alert tone="success" title="Profile updated">
              Your changes have been saved.
            </Alert>
          )}

          <Field label="Full name" required htmlFor="profile-name">
            <Input
              id="profile-name"
              name="name"
              type="text"
              autoComplete="name"
              defaultValue={initialName}
              placeholder="Your full name"
              required
            />
          </Field>

          <Field label="Email" htmlFor="profile-email">
            <Input
              id="profile-email"
              type="email"
              value={email}
              disabled
              className="text-muted"
            />
          </Field>

          <div className="flex items-center gap-2 pt-1">
            <Button type="submit" loading={pending}>
              Save profile
            </Button>
            {state.ok && (
              <span className="inline-flex items-center gap-1 text-sm text-muted">
                <User className="h-3.5 w-3.5" aria-hidden="true" />
                Saved
              </span>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}