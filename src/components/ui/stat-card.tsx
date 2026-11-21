import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils/cn";

export interface StatCardProps {
  label: string;
  value: string;
  /**
   * `StatCard` delta prop: a signed percentage, optionally followed by its
   * comparison window ("+12.5% vs previous 30 days"), or a literal label where
   * a percentage is not meaningful ("No change", "New", "Up from -₦12,000").
   */
  delta?: string | null;
  /** Small subtitle under the badge, e.g. the prior figure ("was ₦680,000"). */
  detail?: string | null;
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
  detail,
  hint,
  loading = false,
  className,
  href,
  invertDelta = false,
  compactOnMobile = false,
}: StatCardProps) {
  // A badge can carry context after its figure ("-76% vs previous 90 days",
  // "+₦50,892.21 vs previous 90 days"), so detect a *leading* signed figure.
  const trimmedDelta = delta?.trim() ?? "";
  const percent = trimmedDelta.match(/^([+-]?\d+(?:\.\d+)?)%([\s\S]*)$/);
  const isPercent = percent != null;
  const signedAmount = isPercent ? null : trimmedDelta.match(/^([+-]\S+)([\s\S]*)$/);
  const isSignedAmount = signedAmount != null;
  const isLabel = delta != null && !isPercent && !isSignedAmount;
  const showDelta = !!delta && !loading;
  const positive = (isPercent || isSignedAmount) && !trimmedDelta.startsWith("-");
  const unchanged = isPercent && Number(percent?.[1]) === 0;
  const good = invertDelta ? !positive : positive;

  const cell = (
    <div
      role="group"
      aria-label={`${label}: ${value}${delta ? `. ${delta}` : ""}${detail ? `. ${detail}` : ""}`}
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
      {(showDelta || detail || hint) && (
        <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          {showDelta && (
            <span
              className="flex min-w-0 flex-col"
              title={detail ? `${delta} — ${detail}` : undefined}
              aria-label={detail ? `${delta}. ${detail}` : delta ?? undefined}
            >
              <span
                className={cn(
                  "text-xs font-medium tabular-nums break-words",
                  unchanged || isLabel
                    ? "text-muted"
                    : good
                      ? "text-success-strong"
                      : "text-danger-strong",
                )}
              >
                {isPercent ? (
                  <>
                    {percent?.[1]}%
                    {percent?.[2] && (
                      <span className="font-normal text-muted">{percent[2]}</span>
                    )}
                  </>
                ) : isSignedAmount && signedAmount ? (
                  <>
                    {signedAmount[1]}
                    {signedAmount[2] && (
                      <span className="font-normal text-muted">{signedAmount[2]}</span>
                    )}
                  </>
                ) : (
                  delta
                )}
              </span>
              {detail && (
                <span className="text-[11px] leading-tight text-muted break-words">
                  {detail}
                </span>
              )}
            </span>
          )}
          {hint && (
            <span className="text-xs text-muted break-words">{hint}</span>
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
