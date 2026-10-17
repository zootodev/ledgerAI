"use client";

import * as React from "react";
import {
  validateFields,
  type FieldValidators,
} from "@/lib/auth/form-validation";

export interface AuthFieldErrors {
  /** Current inline errors, keyed by field `name`. */
  errors: Record<string, string>;
  /** Attach to the `<form>` element so blur/submit can read its values. */
  formRef: React.RefObject<HTMLFormElement | null>;
  /** Attach to the `<form>`: validates the field that just lost focus. */
  onBlur: (event: React.FocusEvent<HTMLFormElement>) => void;
  /**
   * Attach to the `<form>`: validates every field. A failed check cancels the
   * submit so nothing pointless is sent to the server — which validates again
   * and stays the source of truth.
   */
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}

/**
 * Inline, per-field validation for the credential forms.
 *
 * Errors are recomputed from the live form on blur *and* on submit, so a field
 * that has been corrected stops showing its message. Values are read from the
 * form itself (not from React state), which keeps this hook stateless with
 * respect to the fields and safe with server actions and autofill.
 */
export function useAuthFieldErrors(validators: FieldValidators): AuthFieldErrors {
  const formRef = React.useRef<HTMLFormElement | null>(null);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const validateOne = React.useCallback(
    (name: string) => {
      const form = formRef.current;
      const validate = validators[name];
      if (!form || !validate) return;
      const message = validate(new FormData(form));
      setErrors((previous) => {
        if (!message) {
          if (!(name in previous)) return previous;
          const next = { ...previous };
          delete next[name];
          return next;
        }
        if (previous[name] === message) return previous;
        return { ...previous, [name]: message };
      });
    },
    [validators],
  );

  const onBlur = React.useCallback(
    (event: React.FocusEvent<HTMLFormElement>) => {
      const target = event.target as unknown as { name?: string } | null;
      const name = target?.name;
      if (name) validateOne(name);
    },
    [validateOne],
  );

  const onSubmit = React.useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      const found = validateFields(new FormData(event.currentTarget), validators);
      setErrors(found);
      if (Object.keys(found).length > 0) event.preventDefault();
    },
    [validators],
  );

  return { errors, formRef, onBlur, onSubmit };
}
