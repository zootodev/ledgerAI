import { cn } from "@/lib/utils/cn";
import { LedgerMark } from "@/components/brand/wordmark";

export function Logo({
  className,
  showText = true,
}: {
  className?: string;
  showText?: boolean;
}) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <LedgerMark className="h-6 w-6 text-brand" />
      {showText && (
        <span className="text-[17px] font-semibold tracking-[-0.02em] text-foreground">
          Ledger<span className="text-brand">AI</span>
        </span>
      )}
    </span>
  );
}
