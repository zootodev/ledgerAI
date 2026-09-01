import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
  placeholder?: string;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  function Select({ className, invalid, placeholder, children, ...props }, ref) {
    return (
      <div className="relative">
        <select
          ref={ref}
          className={cn(
            "flex h-9.5 w-full appearance-none rounded-field border bg-surface px-3 pr-9 text-sm text-foreground",
            "focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand",
            "disabled:cursor-not-allowed disabled:opacity-50",
            invalid
              ? "border-danger focus:border-danger focus:ring-danger/30"
              : "border-border-strong",
            className,
          )}
          aria-invalid={invalid || undefined}
          {...props}
        >
          {placeholder && (
            <option value="" disabled hidden>
              {placeholder}
            </option>
          )}
          {children}
        </select>
        <ChevronDown
          className="pointer-events-none absolute inset-y-0 right-3 my-auto h-4 w-4 text-subtle"
          aria-hidden="true"
        />
      </div>
    );
  },
);
