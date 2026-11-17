import { cn } from "@/lib/utils/cn";

/** Three ruled lines and a spine: a ledger mark, not a letter in a box. */
export function LedgerMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 28 28"
      fill="none"
      aria-hidden="true"
      className={cn("h-6 w-6", className)}
    >
      <path
        d="M4 4v20M8 7h16M8 14h11M8 21h16"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="square"
      />
    </svg>
  );
}

export function Wordmark({
  className,
  markClassName,
}: {
  className?: string;
  markClassName?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LedgerMark className={cn("text-brand", markClassName)} />
      <span className="text-[17px] font-semibold tracking-[-0.02em] text-foreground">
        Ledger<span className="text-brand">AI</span>
      </span>
    </span>
  );
}
