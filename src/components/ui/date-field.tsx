"use client";

import * as React from "react";
import { Input, type InputProps } from "@/components/ui/input";
import { formatIsoDateInput, parseDisplayDate } from "@/lib/utils/dates";

export interface DateFieldProps
  extends Omit<InputProps, "type" | "value" | "defaultValue" | "onChange"> {
  /** Controlled ISO day (YYYY-MM-DD). */
  value?: string;
  /** Initial ISO day for an uncontrolled field, such as a form default. */
  defaultValue?: string;
  /** Receives a validated ISO day once the visible DD/MM/YYYY field is complete. */
  onIsoChange?: (iso: string) => void;
}

interface Draft {
  /** ISO value the typed text belongs to. */
  iso: string;
  text: string;
}

/**
 * A date field that shows DD/MM/YYYY while keeping ISO values on the wire.
 * Native date inputs follow the browser locale, which renders 01/10/2026 as
 * 10/01/2026 for many users; this field keeps en-NG order everywhere.
 */
export function DateField({
  value,
  defaultValue = "",
  onIsoChange,
  name,
  onBlur,
  ...props
}: DateFieldProps) {
  const controlled = value !== undefined;
  const [uncontrolledIso, setUncontrolledIso] = React.useState(defaultValue);
  const [draft, setDraft] = React.useState<Draft | null>(null);

  const iso = controlled ? (value as string) : uncontrolledIso;
  // Keep typed text only while it belongs to the current ISO value. A preset
  // or other external change replaces it with the canonical DD/MM/YYYY text.
  const text = draft?.iso === iso ? draft.text : formatIsoDateInput(iso);

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const nextText = event.target.value;
    const parsed = parseDisplayDate(nextText);
    setDraft({ iso: parsed ?? iso, text: nextText });

    if (parsed && parsed !== iso) {
      if (!controlled) setUncontrolledIso(parsed);
      onIsoChange?.(parsed);
    }
  }

  function handleBlur(event: React.FocusEvent<HTMLInputElement>) {
    if (!parseDisplayDate(text)) setDraft(null);
    onBlur?.(event);
  }

  return (
    <>
      <Input
        {...props}
        type="text"
        inputMode="numeric"
        placeholder="DD/MM/YYYY"
        pattern="\d{2}/\d{2}/\d{4}"
        maxLength={10}
        lang="en-NG"
        autoComplete="off"
        value={text}
        onChange={handleChange}
        onBlur={handleBlur}
      />
      {name && <input type="hidden" name={name} value={iso} readOnly />}
    </>
  );
}
