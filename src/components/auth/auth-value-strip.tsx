import { Check } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export interface AuthValueStripProps {
  /** Which flow this strip sells — signup vs sign-in copy. */
  intent: "signup" | "login";
  className?: string;
}

const STEPS: Record<
  AuthValueStripProps["intent"],
  Array<[string, string]>
> = {
  signup: [
    ["Import", "Upload a bank or PDF statement"],
    ["Review", "Confirm how each transaction is categorized"],
    ["Profit", "See income minus costs, clearly"],
  ],
  login: [
    ["Review", "Check recent imports and uncategorized rows"],
    ["Fix", "Recategorize or correct in a few clicks"],
    ["Profit", "Keep your profit picture up to date"],
  ],
};

/**
 * Three-step "Import → Review → Profit" pitch shown inside the signup/sign-in
 * surfaces so the first real outcome is clear before an account exists.
 */
export function AuthValueStrip({ intent, className }: AuthValueStripProps) {
  const steps = STEPS[intent];
  return (
    <ol className={cn("space-y-1.5", className)}>
      {steps.map(([title, text]) => (
        <li key={title} className="flex items-baseline gap-2 text-sm">
          <Check className="h-4 w-4 shrink-0 translate-y-0.5 text-brand" aria-hidden="true" />
          <p>
            <span className="font-medium text-foreground">{title}.</span>{" "}
            <span className="text-muted">{text}</span>
          </p>
        </li>
      ))}
    </ol>
  );
}