import * as React from "react";
import { cn } from "@/lib/utils/cn";

export interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  required?: boolean;
}

export const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
  function Label({ className, required, children, ...props }, ref) {
    return (
      <label
        ref={ref}
        className={cn(
          "text-sm font-medium text-foreground",
          className,
        )}
        {...props}
      >
        {children}
        {required && (
          <span className="ml-0.5 text-danger" aria-hidden="true">
            *
          </span>
        )}
      </label>
    );
  },
);
