"use client";

import * as React from "react";
import { useRef, useEffect } from "react";
import { cn } from "@/lib/utils/cn";

export interface DropdownItemProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  destructive?: boolean;
  icon?: React.ReactNode;
}

export function DropdownItem({
  className,
  destructive,
  icon,
  children,
  ...props
}: DropdownItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      className={cn(
        "flex w-full items-center gap-2 rounded-field px-3 py-2 text-left text-sm transition-colors",
        destructive
          ? "text-danger hover:bg-danger-soft"
          : "text-foreground hover:bg-surface-subtle",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}

export interface DropdownProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
  align?: "start" | "end";
  className?: string;
  menuClassName?: string;
}

/** Lightweight dropdown menu. Trigger should render a button or clickable element. */
export function Dropdown({
  trigger,
  children,
  align = "end",
  className,
  menuClassName,
}: DropdownProps) {
  const [open, setOpen] = React.useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={cn("relative inline-block", className)}>
      <div onClick={() => setOpen((o) => !o)}>{trigger}</div>
      {open && (
        <div
          ref={menuRef}
          role="menu"
          className={cn(
            "absolute z-30 mt-1 min-w-44 rounded-card border border-border bg-surface p-1.5 shadow-popover",
            align === "end" ? "right-0" : "left-0",
            menuClassName,
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}
