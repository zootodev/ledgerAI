import { cn } from "@/lib/utils/cn";

export interface AuthValueStripProps {
  /** Which flow this note belongs to. */
  intent: "signup" | "login";
  className?: string;
}

const NOTE: Record<AuthValueStripProps["intent"], string> = {
  signup:
    "After you sign up, upload one statement. LedgerAI shows every row before anything is saved.",
  login:
    "Your latest import and any rows left in review are waiting on the overview.",
};

/** One plain sentence about the next step. No sales triad. */
export function AuthValueStrip({ intent, className }: AuthValueStripProps) {
  return (
    <p className={cn("text-sm leading-6 text-muted", className)}>
      {NOTE[intent]}
    </p>
  );
}
