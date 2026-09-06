import * as React from "react";
import { cn } from "@/lib/utils/cn";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
  leftIcon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  function Input({ className, invalid, leftIcon, ...props }, ref) {
    return (
      <div className="block w-full min-w-0">
        <div className="relative min-w-0">
          {leftIcon && (
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-subtle">
              {leftIcon}
            </span>
          )}
          <input
            ref={ref}
            suppressHydrationWarning
            className={cn(
              "block h-9.5 w-full min-w-0 rounded-field border bg-surface px-3 text-sm text-foreground",
              "placeholder:text-subtle",
              "focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand",
              "disabled:cursor-not-allowed disabled:opacity-50",
              leftIcon && "pl-9",
              invalid
                ? "border-danger focus:border-danger focus:ring-danger/30"
                : "border-border-strong",
              className,
            )}
            aria-invalid={invalid || undefined}
            {...props}
          />
        </div>
      </div>
    );
  },
);
