"use client";

import * as React from "react";
import { useActionState } from "react";
import { ShieldCheck } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import {
  confirmMfaAction,
  disableMfaAction,
  enrollMfaAction,
  type MfaEnrollState,
  type MfaFormState,
} from "@/lib/auth/actions";

const initialEnroll: MfaEnrollState = {};
const initialForm: MfaFormState = {};

export interface SecuritySettingsProps {
  /** True when at least one TOTP factor is verified for this user. */
  mfaEnabled: boolean;
  /** Friendly name of the enrolled factor, when known. */
  factorName?: string | null;
}

/**
 * Settings > Security. Owns two-factor (TOTP) enrollment, confirmation and
 * disabling. Every mutation runs through a server action bound to the request
 * session — the client never sees or supplies a factor id it wasn't just
 * handed by the server, and disabling always requires a fresh code.
 */
export function SecuritySettings({ mfaEnabled, factorName }: SecuritySettingsProps) {
  const [enrollState, enrollAction, enrollPending] = useActionState(
    enrollMfaAction,
    initialEnroll,
  );
  const [confirmState, confirmAction, confirmPending] = useActionState(
    confirmMfaAction,
    initialForm,
  );
  const [disableState, disableAction, disablePending] = useActionState(
    disableMfaAction,
    initialForm,
  );

  const enrolling = Boolean(enrollState.qrCode);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-brand" aria-hidden="true" />
            Two-factor authentication
          </CardTitle>
          <CardDescription>
            Add a one-time code from an authenticator app as a second step when
            you sign in. This protects your books even if your password leaks.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {mfaEnabled ? (
            <>
              <Alert tone="success" title="Two-factor authentication is on">
                {factorName
                  ? `You sign in with "${factorName}".`
                  : "You sign in with your authenticator app."}{" "}
                Keep your recovery codes and device safe.
              </Alert>

              <form action={disableAction} className="space-y-3">
                {disableState.error && (
                  <Alert tone="danger" title="Couldn't turn off 2FA">
                    {disableState.error}
                  </Alert>
                )}
                <Field
                  id="disable-code"
                  label="Confirm with a current code"
                  hint="Enter the 6-digit code from your app to turn 2FA off."
                >
                  <Input
                    id="disable-code"
                    name="code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]*"
                    maxLength={6}
                    placeholder="123456"
                    required
                  />
                </Field>
                <Button type="submit" variant="dangerOutline" loading={disablePending}>
                  Turn off two-factor authentication
                </Button>
              </form>
            </>
          ) : enrolling ? (
            <>
              <p className="text-sm text-muted">
                Scan this QR code with your authenticator app (Google
                Authenticator, Authy, 1Password), then enter the 6-digit code it
                shows to finish.
              </p>

              <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
                {/* Supabase returns the QR as an inline SVG data URI. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={enrollState.qrCode}
                  alt="QR code to add LedgerAI to your authenticator app"
                  width={168}
                  height={168}
                  className="rounded-lg border border-border bg-white p-2"
                />
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-subtle">
                    Or enter this key manually
                  </p>
                  <code className="mt-1 block break-all rounded-field bg-surface-subtle px-3 py-2 font-mono text-sm text-foreground">
                    {enrollState.secret}
                  </code>
                </div>
              </div>

              <form action={confirmAction} className="space-y-3">
                {confirmState.error && (
                  <Alert tone="danger" title="Check the code">
                    {confirmState.error}
                  </Alert>
                )}
                <input type="hidden" name="factorId" value={enrollState.factorId ?? ""} />
                <Field id="confirm-code" label="Enter the 6-digit code">
                  <Input
                    id="confirm-code"
                    name="code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]*"
                    maxLength={6}
                    placeholder="123456"
                    required
                  />
                </Field>
                <Button type="submit" loading={confirmPending}>
                  Turn on two-factor authentication
                </Button>
              </form>
            </>
          ) : (
            <form action={enrollAction} className="space-y-3">
              {enrollState.error && (
                <Alert tone="danger" title="Couldn't start setup">
                  {enrollState.error}
                </Alert>
              )}
              <p className="text-sm text-muted">
                Two-factor authentication is currently off. We recommend turning
                it on.
              </p>
              <Button type="submit" loading={enrollPending}>
                Set up two-factor authentication
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
