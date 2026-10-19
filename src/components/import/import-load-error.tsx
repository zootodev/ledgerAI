"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { ErrorState } from "@/components/ui/error-state";

export interface ImportLoadErrorProps {
  userName?: string;
  userEmail?: string;
  onSignOut?: () => void;
}

/**
 * Inline fallback for the /import page when its server data load fails (for
 * example a database outage). It keeps the app shell and offers a retry so the
 * user is not dropped onto the global error page, and no work they had in the
 * wizard is implied to be lost.
 */
export function ImportLoadError({ userName, userEmail, onSignOut }: ImportLoadErrorProps) {
  const router = useRouter();

  return (
    <AppShell
      onSignOut={onSignOut}
      header={{
        title: "Import",
        user: userName ? { name: userName, email: userEmail } : null,
      }}
    >
      <div className="mx-auto max-w-6xl">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Import transactions
        </h1>
        <div className="mt-6">
          <ErrorState
            title="We couldn't load your import data"
            description="Something went wrong talking to the database. Your data is safe — try again."
            onRetry={() => router.refresh()}
          />
        </div>
      </div>
    </AppShell>
  );
}
