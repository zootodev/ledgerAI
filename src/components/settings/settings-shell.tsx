"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { Tabs } from "@/components/ui/tabs";

export interface SettingsShellProps {
  active: "accounts" | "categories" | "rules";
  userName?: string;
  userEmail: string;
  businessName: string;
  onSignOut?: () => void;
  children: React.ReactNode;
}

export function SettingsShell({
  active,
  userName,
  userEmail,
  businessName,
  onSignOut,
  children,
}: SettingsShellProps) {
  const router = useRouter();

  const paths: Record<string, string> = {
    accounts: "/settings/accounts",
    categories: "/settings/categories",
    rules: "/settings/rules",
  };

  return (
    <AppShell
      onSignOut={onSignOut}
      header={{
        title: "Settings",
        user: userName ? { name: userName, email: userEmail } : null,
      }}
    >
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Settings</h1>
          <p className="mt-1 text-muted">Manage the building blocks used across LedgerAI · {businessName}</p>
        </div>

        <Tabs
          ariaLabel="Settings sections"
          value={active}
          onChange={(value: string) => router.push(paths[value] ?? "/settings/accounts")}
          items={[
            { value: "accounts", label: "Accounts" },
            { value: "categories", label: "Categories" },
            { value: "rules", label: "Rules" },
          ]}
        />

        {children}
      </div>
    </AppShell>
  );
}