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
          "flex h-6 w-6 shrink-0 items-center justify-center rounded border",
          (checked || indeterminate)
            ? "border-brand bg-brand text-on-accent shadow-sm ring-2 ring-brand/25"
            : "border-border-strong bg-surface",
          "transition-colors",
          "group-focus-within:ring-2 group-focus-within:ring-brand/40",
          "group-hover:border-brand",
          "disabled:opacity-50",
          className,
        )}
      >
        {indeterminate ? (
          <Minus className="h-3.5 w-3.5" strokeWidth={3} />
        ) : checked ? (
          <Check className="h-3.5 w-3.5" strokeWidth={3} />
        ) : null}
      </span>
    );

    return (
      <label
        className={cn(
          "group inline-flex min-h-10 cursor-pointer select-none items-center gap-2",
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
