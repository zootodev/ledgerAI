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
        <ErrorState
          title="Imports didn't load"
          description="The database request failed. Try again. Your saved imports are unchanged."
          onRetry={() => router.refresh()}
        />
      </div>
    </AppShell>
  );
}
