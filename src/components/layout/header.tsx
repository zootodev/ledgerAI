"use client";

import * as React from "react";
import { Bell, ChevronDown, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dropdown, DropdownItem } from "@/components/ui/dropdown";
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
  return (
    <header
      className={cn(
        "sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-surface/90 px-4 backdrop-blur-sm sm:px-6",
        className,
      )}
    >
      <div className="flex flex-1 items-center gap-3">
        {title && <h1 className="truncate text-base font-semibold text-foreground">{title}</h1>}
      </div>

      <div className="hidden items-center gap-2 md:flex">
        <SearchField />
      </div>

      <div className="flex items-center gap-1.5">
        {actions}
        <Button variant="ghost" size="icon" aria-label="Notifications">
          <Bell className="h-4.5 w-4.5" />
        </Button>

        {user && (
          <Dropdown
            trigger={
              <Button variant="ghost" className="gap-2 pl-2 pr-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand text-xs font-semibold text-on-accent">
                  {initials(user.name)}
                </span>
                <span className="hidden max-w-36 truncate text-sm font-medium lg:block">
                  {user.name}
                </span>
                <ChevronDown className="hidden h-4 w-4 text-subtle lg:block" aria-hidden="true" />
              </Button>
            }
          >
            <DropdownItem onClick={() => {}}>Profile</DropdownItem>
            <DropdownItem onClick={() => {}}>Settings</DropdownItem>
            <DropdownItem destructive onClick={onSignOut}>
              Sign out
            </DropdownItem>
          </Dropdown>
        )}
      </div>
    </header>
  );
}

export function SearchField({ className }: { className?: string }) {
  return (
    <div className={cn("relative w-64", className)}>
      <Search className="pointer-events-none absolute inset-y-0 left-3 my-auto h-4 w-4 text-subtle" aria-hidden="true" />
      <input
        type="search"
        placeholder="Search…"
        aria-label="Search"
        className="h-9 w-full rounded-field border border-border-strong bg-surface-subtle pl-9 pr-3 text-sm text-foreground placeholder:text-subtle focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
      />
    </div>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase())
    .join("");
}
