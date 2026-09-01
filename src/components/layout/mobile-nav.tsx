"use client";

import * as React from "react";
import { Menu, X } from "lucide-react";
import { Sidebar } from "@/components/layout/sidebar";
import { cn } from "@/lib/utils/cn";

export interface MobileNavProps extends React.HTMLAttributes<HTMLDivElement> {
  open: boolean;
  onClose: () => void;
}

/** Slide-in mobile navigation drawer with the sidebar contents. */
export function MobileNav({ open, onClose, className }: MobileNavProps) {
  React.useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  React.useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (open) document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  return (
    <div className={cn("lg:hidden", className)}>
      {/* Trigger handled by the AppShell header via onMenuToggle */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]"
            onClick={onClose}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            className="absolute inset-y-0 left-0 flex w-72 flex-col bg-surface shadow-modal"
          >
            <div className="flex h-14 items-center justify-between border-b border-border px-4">
              <span className="flex items-center gap-2 font-semibold text-foreground">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand text-sm font-bold text-on-accent">
                  L
                </span>
                LedgerAI
              </span>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close navigation"
                className="rounded-md p-1 text-subtle hover:bg-surface-subtle hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <Sidebar onNavigate={onClose} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function MobileMenuButton({
  onToggle,
  label = "Toggle navigation",
}: {
  onToggle: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={label}
      className="rounded-md p-1.5 text-secondary hover:bg-surface-subtle hover:text-foreground lg:hidden"
    >
      <Menu className="h-5 w-5" />
    </button>
  );
}
