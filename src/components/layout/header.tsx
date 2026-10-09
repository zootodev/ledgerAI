"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
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
  const router = useRouter();
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
                  {user.name}
                </span>
                <ChevronDown className="hidden h-4 w-4 text-subtle lg:block" aria-hidden="true" />
              </Button>
            }
          >
            <DropdownItem onClick={() => router.push("/settings/profile")}>Profile</DropdownItem>
            <DropdownItem onClick={() => router.push("/settings")}>Settings</DropdownItem>
            <DropdownItem destructive onClick={onSignOut}>
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
