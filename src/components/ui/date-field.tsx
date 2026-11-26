"use client";

import * as React from "react";
import { CalendarRange } from "lucide-react";
import { Input, type InputProps } from "@/components/ui/input";
import { cn } from "@/lib/utils/cn";
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

export interface DateDraft {
  /** ISO value the visible text belongs to. */
  iso: string;
  text: string;
}

/** Shared commit path for typing and for the native picker. */
export function commitIsoSelection(
  iso: string,
  onIsoChange?: (iso: string) => void,
): DateDraft {
  onIsoChange?.(iso);
  return { iso, text: formatIsoDateInput(iso) };
}

/** Parse typed DD/MM/YYYY exactly as the visible input always has. */
export function commitTypedDate(
  text: string,
  currentIso: string,
  onIsoChange?: (iso: string) => void,
): { draft: DateDraft; parsed: string | null } {
  const parsed = parseDisplayDate(text);
  if (parsed && parsed !== currentIso) onIsoChange?.(parsed);
  return { draft: { iso: parsed ?? currentIso, text }, parsed };
}

/**
 * A date field that shows DD/MM/YYYY while keeping ISO values on the wire.
 * Native date inputs follow the browser locale, which renders 01/10/2026 as
 * 10/01/2026 for many users; this field keeps en-NG order everywhere. The
 * calendar button opens the browser's native picker on a hidden ISO input.
 */
export function DateField({
  value,
  defaultValue = "",
  onIsoChange,
  name,
  onBlur,
  className,
  min,
  max,
  ...props
}: DateFieldProps) {
  const controlled = value !== undefined;
  const [uncontrolledIso, setUncontrolledIso] = React.useState(defaultValue);
  const [draft, setDraft] = React.useState<DateDraft | null>(null);
  const textRef = React.useRef<HTMLInputElement>(null);
  const pickerRef = React.useRef<HTMLInputElement>(null);

  const iso = controlled ? (value as string) : uncontrolledIso;
  // Keep typed text only while it belongs to the current ISO value. A preset
  // or other external change replaces it with the canonical DD/MM/YYYY text.
  const text = draft?.iso === iso ? draft.text : formatIsoDateInput(iso);

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const { draft: nextDraft, parsed } = commitTypedDate(event.target.value, iso, onIsoChange);
    setDraft(nextDraft);
    if (parsed && parsed !== iso && !controlled) setUncontrolledIso(parsed);
  }

  function handleBlur(event: React.FocusEvent<HTMLInputElement>) {
    if (!parseDisplayDate(text)) setDraft(null);
    onBlur?.(event);
  }

  function openPicker(event: React.MouseEvent<HTMLButtonElement>) {
    // The field is usually wrapped in a <label>; don't let that steal focus.
    event.preventDefault();
    event.stopPropagation();
    const picker = pickerRef.current;
    try {
      const showPicker = (picker as (HTMLInputElement & { showPicker?: () => void }) | null)
        ?.showPicker;
      if (typeof showPicker === "function") {
        showPicker.call(picker);
        return;
      }
    } catch {
      // Unsupported browser or no transient user activation — keep the text
      // field usable instead of breaking the form.
    }
    textRef.current?.focus();
  }

  function handlePickerChange(event: React.ChangeEvent<HTMLInputElement>) {
    const nextIso = event.target.value;
    if (!nextIso || nextIso === iso) return;
    setDraft(commitIsoSelection(nextIso, onIsoChange));
    if (!controlled) setUncontrolledIso(nextIso);
  }

  return (
    <>
      <div className="relative" data-date-field="">
        <Input
          {...props}
          ref={textRef}
          type="text"
          inputMode="numeric"
          placeholder="DD/MM/YYYY"
          pattern="\d{2}/\d{2}/\d{4}"
          maxLength={10}
          lang="en-NG"
          autoComplete="off"
          className={cn("pr-10", className)}
          value={text}
          onChange={handleChange}
          onBlur={handleBlur}
        />
        <button
          type="button"
          aria-label="Choose date"
          onClick={openPicker}
          className="absolute inset-y-0 right-0 flex w-9 items-center justify-center rounded-r-field text-muted transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
        >
          <CalendarRange className="h-4 w-4" aria-hidden="true" />
        </button>
        <input
          ref={pickerRef}
          type="date"
          value={iso}
          min={min === undefined ? undefined : String(min)}
          max={max === undefined ? undefined : String(max)}
          onChange={handlePickerChange}
          tabIndex={-1}
          aria-hidden="true"
          className="sr-only"
        />
      </div>
      {name && <input type="hidden" name={name} value={iso} readOnly />}
    </>
  );
}
