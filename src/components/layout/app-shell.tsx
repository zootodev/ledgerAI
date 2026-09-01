"use client";

import * as React from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Header, type HeaderProps } from "@/components/layout/header";
import { MobileNav, MobileMenuButton } from "@/components/layout/mobile-nav";
import { cn } from "@/lib/utils/cn";

export interface AppShellProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Header props (title, user, actions) passed to the top bar. */
  header?: Omit<HeaderProps, "onMenuToggle">;
  children: React.ReactNode;
}

/** Authenticated app layout: sidebar + top bar + content. */
export function AppShell({ header, children, className }: AppShellProps) {
  const [navOpen, setNavOpen] = React.useState(false);

  return (
    <div className="flex min-h-screen w-full bg-background">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 border-r border-border bg-surface lg:block">
        <div className="flex h-14 items-center gap-2 border-b border-border px-4">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand text-sm font-bold text-on-accent">
            L
          </span>
          <span className="font-semibold text-foreground">LedgerAI</span>
        </div>
        <Sidebar />
      </aside>

      {/* Mobile nav drawer */}
      <MobileNav open={navOpen} onClose={() => setNavOpen(false)} />

      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          {...header}
          title={
            <span className="flex items-center gap-2">
              <MobileMenuButton onToggle={() => setNavOpen((o) => !o)} />
              {header?.title}
            </span>
          }
        />
        <main className={cn("flex-1 px-4 py-6 sm:px-6", className)}>{children}</main>
      </div>
    </div>
  );
}
