"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { Select } from "@/components/ui/select";
import type { AccountServiceData } from "@/lib/services/accounts";

export interface ReportsAccountFilterProps {
  /** Tenant-owned accounts the session may filter by (server-provided). */
  accounts: AccountServiceData[];
  /** Currently applied, server-validated account id (or undefined). */
  value?: string;
  /** Current search params so unrelated parameters are preserved on update. */
  params?: Record<string, string | string[] | undefined>;
}

/**
 * Client account filter for the Reports page. Writes ?accountId= onto the URL
 * so the server page re-validates the id against the session business's own
 * accounts before any query runs. No financial logic lives here.
 */
export function ReportsAccountFilter({
  accounts,
  value,
  params,
}: ReportsAccountFilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  /** Push a new account selection onto the URL, preserving everything else. */
  const apply = (nextAccountId: string) => {
    const next = new URLSearchParams();
    for (const [key, entry] of Object.entries(params ?? {})) {
      if (entry === undefined) continue;
      if (Array.isArray(entry)) {
        for (const item of entry) next.append(key, item);
      } else {
        next.set(key, entry);
      }
    }
    if (nextAccountId) next.set("accountId", nextAccountId);
    else next.delete("accountId");
    const qs = next.toString();
    startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname));
  };

  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-xs font-medium uppercase tracking-wide text-muted">
        Account
      </span>
      <Select
        value={value ?? ""}
        onChange={(event) => apply(event.target.value)}
        disabled={isPending}
        aria-label="Filter reports by account"
        className="h-9.5 w-44"
      >
        <option value="">All accounts</option>
        {accounts.map((account) => (
          <option key={account.id} value={account.id}>
            {account.name}
          </option>
        ))}
      </Select>
    </label>
  );
}