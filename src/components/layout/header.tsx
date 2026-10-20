"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dropdown, DropdownItem, DropdownLink } from "@/components/ui/dropdown";
import { PRIVACY_PATH, TERMS_PATH } from "@/lib/legal/constants";
import { purgeImportCaches, localStore, sessionStore } from "@/lib/import/draft";
import { cn } from "@/lib/utils/cn";

export interface UserMenu {
  name: string;
  email?: string;
}

export interface HeaderProps
  extends Omit<React.HTMLAttributes<HTMLElement>, "title"> {
  title?: React.ReactNode;
  user?: UserMenu | null;
  /** Render additional actions on the right of the header. */
  actions?: React.ReactNode;
  /** Called when the user picks "Sign out" from the user menu. */
  onSignOut?: () => void;
}

export function Header({ title, user, actions, onSignOut, className }: HeaderProps) {
  // Phase 5: signing out drops every import cache this browser holds, so a
  // later visitor (or another account) never resumes the previous tenant's
  // unfinished review.
  const handleSignOut = React.useCallback(() => {
    purgeImportCaches([localStore(), sessionStore()]);
    onSignOut?.();
  }, [onSignOut]);
  return (
    <header
      className={cn(
        "sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-surface/90 px-4 backdrop-blur-sm sm:px-6 print:hidden",
        className,
      )}
    >
      <div className="flex flex-1 items-center gap-3">
        {title && <h1 className="truncate text-base font-semibold text-foreground">{title}</h1>}
      </div>

      <div className="flex items-center gap-1.5">
        {actions}

        {user && (
          <Dropdown
            trigger={
              <Button variant="ghost" className="gap-2 pl-2 pr-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand text-xs font-semibold text-on-accent">
                  {initials(user.name)}
                </span>
                <span className="hidden max-w-36 truncate text-sm font-medium lg:block">
                  {firstName(user.name)}
                </span>
                <ChevronDown className="hidden h-4 w-4 text-muted lg:block" aria-hidden="true" />
              </Button>
            }
          >
            {/* The button shows only the first name (it used to truncate the
                full name); the menu keeps the full identity visible. */}
            <div className="border-b border-border px-3 pb-2 pt-1">
              <p className="truncate text-sm font-medium text-foreground">{user.name}</p>
              {user.email && (
                <p className="truncate text-xs text-muted">{user.email}</p>
              )}
            </div>
            <DropdownLink href="/settings/profile">Profile</DropdownLink>
            <DropdownLink href="/settings">Settings</DropdownLink>
            <DropdownLink href={PRIVACY_PATH}>Privacy</DropdownLink>
            <DropdownLink href={TERMS_PATH}>Terms</DropdownLink>
            <DropdownItem destructive onClick={handleSignOut}>
              Sign out
            </DropdownItem>
          </Dropdown>
        )}
      </div>
    </header>
  );
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => Array.from(n)[0]?.toUpperCase())
    .join("");
}

/** First whitespace-delimited name, so the header button never truncates. */
export function firstName(name: string): string {
  return name.split(/\s+/).filter(Boolean)[0] ?? name;
}
