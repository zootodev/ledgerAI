/**
 * Inline field validation for the credential forms (sign up, sign in, forgot
 * password, reset password).
 *
 * This is a **UX layer only**. The server actions re-validate everything and
 * remain the source of truth; nothing here is trusted by the server. The forms
 * are `noValidate`, which suppresses the browser's own "Please fill out this
 * field" bubbles so that errors can be rendered inline, styled and announced
 * consistently (`aria-invalid` + `aria-describedby`).
 *
 * The validators are pure functions over `FormData`, so they can be unit
 * tested without a DOM.
 */

/** Current password policy for *new* passwords (signup, reset). */
export const PASSWORD_MIN_LENGTH = 10;

/**
 * Deliberately permissive: catches typos like a missing `@` without rejecting
 * addresses the server would accept.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** One validator per field name, each reading from a `FormData` snapshot. */
export type FieldValidators = Record<string, (data: FormData) => string | undefined>;

/** Read a field as a string (missing fields read as empty, never `null`). */
export function fieldValue(data: FormData, name: string): string {
  const value = data.get(name);
  return typeof value === "string" ? value : "";
}

export function validateName(value: string): string | undefined {
  return value.trim() ? undefined : "Enter your full name.";
}

export function validateEmail(value: string): string | undefined {
  const email = value.trim();
  if (!email) return "Enter your email address.";
  if (!EMAIL_PATTERN.test(email)) {
    return "Enter a valid email address, like you@example.com.";
  }
  return undefined;
}

/** Validator for a *new* password: the full policy applies. */
export function validateNewPassword(value: string): string | undefined {
  if (!value) return "Choose a password.";
  if (value.length < PASSWORD_MIN_LENGTH) {
    return `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  return undefined;
}

/**
 * Validator for a password being *typed at sign-in*.
 *
 * Sign-in must stay lenient: accounts created before the current policy may
 * have shorter passwords, so only presence is checked here. The sign-in form
 * must never show a "must be N characters" message.
 */
export function validateCurrentPassword(value: string): string | undefined {
  return value ? undefined : "Enter your password.";
}

export function validateConfirmPassword(
  password: string,
  confirm: string,
): string | undefined {
  if (!confirm) return "Re-enter your new password.";
  if (confirm !== password) return "Passwords don't match.";
  return undefined;
}

export function validateTerms(accepted: boolean): string | undefined {
  return accepted
    ? undefined
    : "Please accept the Terms and Privacy Notice to continue.";
}

export function hasAcceptedTerms(data: FormData): boolean {
  const value = data.get("acceptTerms");
  return value === "on" || value === "true" || value === "1";
}

/**
 * Run every validator over one `FormData` snapshot and return the failures.
 * An empty object means the snapshot passed client-side validation.
 */
export function validateFields(
  data: FormData,
  validators: FieldValidators,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const [field, validate] of Object.entries(validators)) {
    const message = validate(data);
    if (message) errors[field] = message;
  }
  return errors;
}
