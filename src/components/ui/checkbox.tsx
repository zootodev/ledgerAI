import * as React from "react";
import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> {
  indeterminate?: boolean;
  label?: React.ReactNode;
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  function Checkbox({ className, indeterminate, label, checked, ...props }, ref) {
    const innerRef = React.useRef<HTMLInputElement | null>(null);

    React.useEffect(() => {
      if (innerRef.current) {
        innerRef.current.indeterminate = indeterminate ?? false;
      }
    }, [indeterminate]);

    const resolvedRef = (node: HTMLInputElement | null) => {
      innerRef.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
    };

    const checkbox = (
      <span
        className={cn(
          "flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded border",
          "bg-surface text-on-accent",
          "transition-colors",
          checked && !indeterminate && "border-brand bg-brand",
          indeterminate && "border-brand bg-brand",
          !checked && !indeterminate && "border-border-strong",
          "group-hover:border-brand",
          "disabled:opacity-50",
          className,
        )}
      >
        {indeterminate ? (
          <Minus className="h-3 w-3" />
        ) : checked ? (
          <Check className="h-3 w-3" />
        ) : null}
      </span>
    );

    return (
      <label
        className={cn(
          "group inline-flex cursor-pointer items-start gap-2 select-none",
          props.disabled && "cursor-not-allowed opacity-60",
        )}
      >
        <span className="relative inline-flex">
          <input
            type="checkbox"
            ref={resolvedRef}
            checked={checked}
            className="peer sr-only"
            {...props}
          />
          {checkbox}
        </span>
        {label && <span className="text-sm text-foreground">{label}</span>}
      </label>
    );
  },
);
