"use client";

import * as React from "react";
import { cn } from "@/lib/utils/cn";

export interface TabItem {
  value: string;
  label: React.ReactNode;
  icon?: React.ReactNode;
  disabled?: boolean;
}

export interface TabsProps {
  items: TabItem[];
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
  className?: string;
}

export function Tabs({ items, value, onChange, ariaLabel, className }: TabsProps) {
  const trackRef = React.useRef<HTMLDivElement>(null);
  const tabRefs = React.useRef(new Map<string, HTMLButtonElement>());
  const [canScrollRight, setCanScrollRight] = React.useState(false);

  const updateScrollCue = React.useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const scrollable = el.scrollWidth > el.clientWidth + 1;
    const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1;
    setCanScrollRight(scrollable && !atEnd);
  }, []);

  React.useEffect(() => {
    updateScrollCue();
    const el = trackRef.current;
    if (!el) return;
    el.addEventListener("scroll", updateScrollCue, { passive: true });
    const observer = new ResizeObserver(updateScrollCue);
    observer.observe(el);
    window.addEventListener("resize", updateScrollCue);
    return () => {
      el.removeEventListener("scroll", updateScrollCue);
      observer.disconnect();
      window.removeEventListener("resize", updateScrollCue);
    };
  }, [updateScrollCue]);

  // On mobile the tab row is wider than the viewport. Keep the selected tab
  // visible on first render and whenever the active section changes (the URL
  // navigation remounts this page).
  const itemCount = items.length;
  React.useEffect(() => {
    tabRefs.current.get(value)?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [value, itemCount]);

  return (
    <div className={cn("relative", className)}>
      <div
        ref={trackRef}
        role="tablist"
        aria-label={ariaLabel}
        className="flex touch-pan-x items-center gap-0.5 overflow-x-auto overscroll-x-contain rounded-field bg-surface-subtle p-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((item) => {
          const active = item.value === value;
          return (
            <button
              key={item.value}
              ref={(node) => {
                if (node) tabRefs.current.set(item.value, node);
                else tabRefs.current.delete(item.value);
              }}
              role="tab"
              type="button"
              aria-selected={active}
              aria-disabled={item.disabled}
              disabled={item.disabled}
              onClick={() => onChange(item.value)}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-field px-3 py-1.5 text-sm font-medium transition-colors",
                active
                  ? "bg-surface text-foreground shadow-card"
                  : "text-muted hover:text-foreground",
                item.disabled && "cursor-not-allowed opacity-50",
              )}
            >
              {item.icon}
              {item.label}
            </button>
          );
        })}
      </div>
      {canScrollRight && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 w-8 rounded-r-field bg-gradient-to-l from-surface-subtle to-transparent"
        />
      )}
    </div>
  );
}
