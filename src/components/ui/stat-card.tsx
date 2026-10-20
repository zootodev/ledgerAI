import * as React from "react";
import Link from "next/link";
import { TrendingDown, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils/cn";

export interface StatCardProps {
  label: string;
  value: string;
  /**
   * Optional change vs the prior period: a signed percentage ("+12.5%",
   * "-3.2%") or a literal label where a percentage is not meaningful
   * ("—" for a flat zero, "New" when there is no prior baseline).
   */
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
  /** Tighter padding/type and no icon below sm (for two-up mobile grids). */
  compactOnMobile?: boolean;
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
  compactOnMobile = false,
}: StatCardProps) {
  // A delta is either a percentage ("+12%") or a literal label used when a
  // percentage would be misleading ("—" for a flat zero, "New" when there is
  // no prior baseline). Literals render neutrally, with no arrow.
  const isPercent = delta != null && delta.trim().endsWith("%");
  const isLabel = delta != null && !isPercent;
  const showDelta = !!delta && !loading;
  const positive = !isLabel && delta != null && !delta.startsWith("-");
  // Exactly zero movement is neither up nor down: show a neutral "0%" with no
  // arrow (and no success/danger tone) instead of implying a direction.
  const unchanged = !isLabel && delta != null && /^[-+]?0%$/.test(delta.trim());
  // Tone reflects whether the movement is good, not merely its direction.
  const good = invertDelta ? !positive : positive;

  const card = (
    <Card
      className={cn(
        "p-5",
        compactOnMobile && "p-4 sm:p-5",
        href && "h-full transition-colors hover:border-brand/40",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p
            className={cn(
              "text-sm font-medium text-muted",
              compactOnMobile && "text-xs sm:text-sm",
            )}
          >
            {label}
          </p>
          {loading ? (
            <div
              className={cn(
                "mt-2 h-8 w-24 animate-pulse rounded bg-surface-subtle",
                compactOnMobile && "h-6 w-16 sm:h-8 sm:w-24",
              )}
            />
          ) : (
            <p
              className={cn(
                "mt-1.5 text-2xl font-semibold tracking-tight text-foreground tabular-nums",
                compactOnMobile && "text-lg sm:text-2xl",
              )}
            >
              {value}
            </p>
          )}
          <div className="mt-1.5 flex items-center gap-2">
            {showDelta && (
              <span
                className={cn(
                  "inline-flex items-center gap-0.5 text-sm font-medium tabular-nums",
                  unchanged || isLabel ? "text-muted" : good ? "text-success" : "text-danger",
                  compactOnMobile && "text-xs sm:text-sm",
                )}
              >
                {isPercent &&
                  !unchanged &&
                  (positive ? (
                    <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <TrendingDown className="h-3.5 w-3.5" aria-hidden="true" />
                  ))}
                {isPercent ? `${delta.replace("%", "")}%` : delta}
              </span>
            )}
            {hint && (
              <span
                className={cn(
                  "text-sm text-muted",
                  compactOnMobile && "text-xs sm:text-sm",
                )}
              >
                {hint}
              </span>
            )}
          </div>
        </div>
        {icon && (
          <div
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand",
              compactOnMobile && "hidden sm:flex",
            )}
          >
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
