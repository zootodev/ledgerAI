import * as React from "react";
import { cn } from "@/lib/utils/cn";

export interface EmptyStateProps {
  /** Retained for call-site compatibility. Empty states stay icon-free. */
  icon?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

/**
 * A quiet ruled panel: one statement of what is missing, one sentence on what
 * to do next, one action. No medallion, illustration or celebration.
 */
export function EmptyState({
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "rounded-card border border-border bg-surface px-5 py-8",
        className,
      )}
    >
      <h3 className="text-[15px] font-semibold text-foreground">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-xl text-sm leading-6 text-muted">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
