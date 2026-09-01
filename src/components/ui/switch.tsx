import * as React from "react";
import { cn } from "@/lib/utils/cn";

export interface SwitchProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label?: React.ReactNode;
}

export const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  function Switch(
    { className, checked, onCheckedChange, label, disabled, ...props },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => !disabled && onCheckedChange(!checked)}
        disabled={disabled}
        className={cn("group inline-flex items-center gap-2 select-none")}
        {...props}
      >
        <span
          className={cn(
            "relative inline-flex h-5.5 w-9.5 shrink-0 items-center rounded-full",
            "transition-colors",
            checked ? "bg-brand" : "bg-border-strong",
            disabled && "opacity-50",
            className,
          )}
        >
          <span
            className={cn(
              "inline-block h-4.5 w-4.5 transform rounded-full bg-white shadow-sm transition-transform",
              checked ? "translate-x-[18px]" : "translate-x-0.5",
            )}
          />
        </span>
        {label && <span className="text-sm text-foreground">{label}</span>}
      </button>
    );
  },
);
