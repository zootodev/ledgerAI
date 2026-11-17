import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils/cn";

export interface StatCardProps {
  label: string;
  value: string;
  /**
   * `StatCard` delta prop: a signed percentage ("+12.5%", "-3.2%") or a
   * literal label where a percentage is not meaningful ("No change" for a flat
   * zero, "New" when there is no prior baseline).
   */
  delta?: string | null;
  /** Retained for call-site compatibility. Metrics render without icons. */
  icon?: React.ReactNode;
  hint?: string;
  loading?: boolean;
  className?: string;
  /** When set, the whole cell links to the underlying records/report. */
  href?: string;
  /**
   * Flip the delta sentiment for metrics where "up is bad" (e.g. expenses):
   * a rise is shown in clay and a fall in green.
   */
  invertDelta?: boolean;
  /** Tighter padding/type below sm (for two-up mobile grids). */
  compactOnMobile?: boolean;
}

/**
 * One figure in a ledger summary strip. No icon tile, no card, no floating
 * shadow: the parent supplies the rules between cells.
 */
export function StatCard({
  label,
  value,
  delta,
  hint,
  loading = false,
  className,
  href,
  invertDelta = false,
  compactOnMobile = false,
}: StatCardProps) {
  const isPercent = delta != null && delta.trim().endsWith("%");
  const isLabel = delta != null && !isPercent;
  const showDelta = !!delta && !loading;
  const positive = !isLabel && delta != null && !delta.startsWith("-");
  const unchanged = !isLabel && delta != null && /^[-+]?0%$/.test(delta.trim());
  const good = invertDelta ? !positive : positive;

  const cell = (
    <div
      className={cn(
        "min-w-0 bg-surface px-4 py-3",
        href && "h-full transition-colors hover:bg-surface-hover",
        compactOnMobile && "px-3 py-2.5 sm:px-4 sm:py-3",
        className,
      )}
    >
      <p
        className={cn(
          "truncate text-xs text-muted",
          compactOnMobile && "text-[11px] sm:text-xs",
        )}
      >
        {label}
      </p>
      {loading ? (
        <div
          className={cn(
            "mt-2 h-7 w-24 animate-pulse rounded bg-surface-subtle",
            compactOnMobile && "h-6 w-20 sm:h-7 sm:w-24",
          )}
        />
      ) : (
        <p
          className={cn(
            "mt-1 text-[22px] font-semibold leading-tight tracking-[-0.02em] text-foreground tabular-nums",
            compactOnMobile && "text-lg sm:text-[22px]",
          )}
        >
          {value}
        </p>
      )}
      {(showDelta || hint) && (
        <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          {showDelta && (
            <span
              className={cn(
                "text-xs font-medium tabular-nums",
                unchanged || isLabel
                  ? "text-muted"
                  : good
                    ? "text-success-strong"
                    : "text-danger-strong",
              )}
            >
              {isPercent ? `${delta.replace("%", "")}%` : delta}
            </span>
          )}
          {hint && (
            <span className="text-xs text-muted">{hint}</span>
          )}
        </div>
      )}
    </div>
  );

  if (!href || loading) return cell;
  return (
    <Link
      href={href}
      className="block h-full rounded-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      {cell}
    </Link>
  );
}
