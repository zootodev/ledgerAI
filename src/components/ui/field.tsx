import * as React from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils/cn";

interface FieldProps {
  id?: string;
  label?: React.ReactNode;
  required?: boolean;
  htmlFor?: string;
  error?: string;
  hint?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

/** Form field wrapper: optional label, control, and error/hint message. */
export function Field({
  id,
  label,
  required,
  htmlFor,
  error,
  hint,
  className,
  children,
}: FieldProps) {
  // Fall back to `htmlFor` so a field given only a label target still gets a
  // usable error/hint id for `aria-describedby` (never `undefined-error`).
  const fieldId = htmlFor ?? id;

  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      {label && (
        <Label required={required} htmlFor={fieldId}>
          {label}
        </Label>
      )}
      {children}
      {error && (
        <p id={`${fieldId}-error`} className="text-sm font-medium text-danger-strong">
          {error}
        </p>
      )}
      {!error && hint && (
        <p id={`${fieldId}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      )}
    </div>
  );
}
