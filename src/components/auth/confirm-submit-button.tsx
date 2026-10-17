"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

/**
 * Submit control for the /auth/confirm form.
 *
 * `useFormStatus` reports the state of the enclosing `<form action>`
 * submission, so the button disables itself and reads "Verifying…" for the
 * whole round trip. Without it a slow verify (e.g. on mobile data) invites a
 * second tap, and a one-time token can only be spent once — the second tap
 * would fail with a confusing "already used" error.
 */
export function ConfirmSubmitButton({ children }: { children: ReactNode }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" fullWidth loading={pending}>
      {pending ? "Verifying…" : children}
    </Button>
  );
}
