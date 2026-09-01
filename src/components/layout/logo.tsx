import { cn } from "@/lib/utils/cn";

export function Logo({
  className,
  showText = true,
}: {
  className?: string;
  showText?: boolean;
}) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand text-sm font-bold text-on-accent">
        L
      </span>
      {showText && <span className="font-semibold text-foreground">LedgerAI</span>}
    </span>
  );
}
