import * as React from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils/cn";

export interface StatCardProps {
  label: string;
  value: string;
  /** Optional delta vs prior period, e.g. "+12.5%" or "-3.2%". */
  delta?: string | null;
  icon?: React.ReactNode;
  hint?: string;
  loading?: boolean;
  className?: string;
}

export function StatCard({
  label,
  value,
  delta,
  icon,
  hint,
  loading = false,
  className,
}: StatCardProps) {
  const positive = delta != null && !delta.startsWith("-");
  const showDelta = !!delta;

  return (
    <Card className={cn("p-5", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted">{label}</p>
          {loading ? (
            <div className="mt-2 h-8 w-24 animate-pulse rounded bg-surface-subtle" />
          ) : (
            <p className="mt-1.5 text-2xl font-semibold tracking-tight text-foreground tabular-nums">
              {value}
            </p>
          )}
          <div className="mt-1.5 flex items-center gap-2">
            {showDelta && !loading && (
              <span
                className={cn(
                  "inline-flex items-center gap-0.5 text-sm font-medium tabular-nums",
                  positive ? "text-success" : "text-danger",
                )}
              >
                {positive ? (
                  <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <TrendingDown className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {delta.replace("%", "")}%
              </span>
            )}
            {hint && <span className="text-sm text-subtle">{hint}</span>}
          </div>
        </div>
        {icon && (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
            {icon}
          </div>
        )}
      </div>
    </Card>
  );
}
