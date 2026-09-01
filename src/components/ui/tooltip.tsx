"use client";

import * as React from "react";
import { cn } from "@/lib/utils/cn";

export interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
}

const sidePositions = {
  top: "bottom-full left-1/2 -translate-x-1/2 mb-1.5",
  bottom: "top-full left-1/2 -translate-x-1/2 mt-1.5",
  left: "right-full top-1/2 -translate-y-1/2 mr-1.5",
  right: "left-full top-1/2 -translate-y-1/2 ml-1.5",
};

/** Accessible tooltip shown on hover/focus. */
export function Tooltip({ content, children, side = "top", className }: TooltipProps) {
  const [visible, setVisible] = React.useState(false);

  return (
    <span
      className={cn("relative inline-flex", className)}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {children}
      {visible && (
        <span
          role="tooltip"
          className={cn(
            "pointer-events-none absolute z-40 max-w-xs whitespace-nowrap rounded-md bg-foreground px-2.5 py-1 text-xs text-on-accent shadow-popover",
            sidePositions[side],
          )}
        >
          {content}
        </span>
      )}
    </span>
  );
}
