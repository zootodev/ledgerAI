"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils/cn";

export interface PasswordFieldProps {
  id: string;
  name: string;
  label?: React.ReactNode;
  hint?: React.ReactNode;
  /** Validation message; also drives aria-invalid + the field error text. */
  error?: string;
  autoComplete?: string;
  placeholder?: string;
  minLength?: number;
  required?: boolean;
  defaultValue?: string;
  className?: string;
}

/**
 * Password input with a visibility toggle and accessible error/hint wiring
 * (aria-invalid plus aria-describedby pointed at the field message). The
 * toggle never submits the form and keeps a visible focus ring.
 */
export function PasswordField({
  id,
  name,
  label = "Password",
  hint,
  error,
  autoComplete = "new-password",
  placeholder = "Enter your password",
  minLength = 8,
  required,
  defaultValue,
  className,
}: PasswordFieldProps) {
  const [visible, setVisible] = React.useState(false);
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <Field label={label} htmlFor={id} required={required} hint={hint} error={error} id={id}>
      <div className={cn("relative", className)}>
        <Input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          placeholder={placeholder}
          minLength={minLength}
          required={required}
          defaultValue={defaultValue}
          invalid={Boolean(error)}
          aria-describedby={describedBy}
          className="pr-10"
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
        >
          {visible ? (
            <EyeOff className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Eye className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      </div>
    </Field>
  );
}