import * as React from "react";
import Link from "next/link";
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
  /** When set, the whole card links to the underlying records/report. */
  href?: string;
  /**
   * Flip the delta sentiment for metrics where "up is bad" (e.g. expenses):
   * a rise is shown in red and a fall in green. The arrow still follows sign.
   */
  invertDelta?: boolean;
}

export function StatCard({
  label,
  value,
  delta,
  icon,
  hint,
  loading = false,
  className,
  href,
  invertDelta = false,
}: StatCardProps) {
  const positive = delta != null && !delta.startsWith("-");
  const showDelta = !!delta && !loading;
  // Exactly zero movement is neither up nor down: show a neutral "0%" with no
  // arrow (and no success/danger tone) instead of implying a direction.
  const unchanged = delta != null && /^[-+]?0%$/.test(delta.trim());
  // Tone reflects whether the movement is good, not merely its direction.
  const good = invertDelta ? !positive : positive;

  const card = (
    <Card
      className={cn(
        "p-5",
        href && "h-full transition-colors hover:border-brand/40",
        className,
      )}
    >
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
            {showDelta && (
              <span
                className={cn(
                  "inline-flex items-center gap-0.5 text-sm font-medium tabular-nums",
                  unchanged ? "text-muted" : good ? "text-success" : "text-danger",
                )}
              >
                {!unchanged &&
                  (positive ? (
                    <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <TrendingDown className="h-3.5 w-3.5" aria-hidden="true" />
                  ))}
                {delta.replace("%", "")}%
              </span>
            )}
            {hint && <span className="text-sm text-muted">{hint}</span>}
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

  if (!href || loading) return card;
  return (
    <Link
      href={href}
      className="block rounded-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      {card}
    </Link>
  );
}
