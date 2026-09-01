import * as React from "react";
import { cn } from "@/lib/utils/cn";

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea({ className, invalid, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        className={cn(
          "flex min-h-20 w-full rounded-field border bg-surface px-3 py-2 text-sm text-foreground",
          "placeholder:text-subtle",
          "focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand",
          "disabled:cursor-not-allowed disabled:opacity-50",
          invalid
            ? "border-danger focus:border-danger focus:ring-danger/30"
            : "border-border-strong",
          className,
        )}
        aria-invalid={invalid || undefined}
        {...props}
      />
    );
  },
);
