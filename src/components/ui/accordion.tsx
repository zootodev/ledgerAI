"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export interface AccordionItemProps {
  value: string;
  title: React.ReactNode;
  children: React.ReactNode;
}

export interface AccordionProps {
  items: AccordionItemProps[];
  value?: string | null;
  onValueChange?: (value: string) => void;
  defaultOpen?: string | null;
  type?: "single" | "multiple";
  className?: string;
}

export function Accordion({
  items,
  value,
  onValueChange,
  defaultOpen = null,
  type = "single",
  className,
}: AccordionProps) {
  const [openSet, setOpenSet] = React.useState<Set<string>>(
    () => new Set(defaultOpen ? [defaultOpen] : []),
  );

  const isControlled = value !== undefined || !!onValueChange;
  const activeValue = value ?? null;
  const isOpen = (itemValue: string) =>
    isControlled ? activeValue === itemValue || (type === "multiple" && openSet.has(itemValue)) : openSet.has(itemValue);

  const toggle = (itemValue: string) => {
    if (isControlled) {
      onValueChange?.(itemValue);
      return;
    }
    setOpenSet((prev) => {
      const next = new Set(prev);
      if (type === "multiple") {
        if (next.has(itemValue)) next.delete(itemValue);
        else next.add(itemValue);
      } else {
        next.clear();
        next.add(itemValue);
      }
      return next;
    });
  };

  return (
    <div className={cn("divide-y divide-border rounded-card border border-border bg-surface", className)}>
      {items.map((item) => {
        const open = isOpen(item.value);
        return (
          <div key={item.value} className="px-4 py-3">
            <h3 className="flex items-center">
              <button
                type="button"
                aria-expanded={open}
                onClick={() => toggle(item.value)}
                className="flex w-full items-center justify-between gap-2 text-left text-sm font-medium text-foreground"
              >
                {item.title}
                <ChevronDown
                  className={cn(
                    "h-4 w-4 shrink-0 text-subtle transition-transform",
                    open && "rotate-180",
                  )}
                  aria-hidden="true"
                />
              </button>
            </h3>
            {open && <div className="mt-2.5 text-sm text-secondary">{item.children}</div>}
          </div>
        );
      })}
    </div>
  );
}
