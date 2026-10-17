import { AlertTriangle, KeyRound, MailCheck } from "lucide-react";
import { ConfirmSubmitButton } from "@/components/auth/confirm-submit-button";
import { emailLinkKind, type EmailLinkKind } from "@/lib/auth/email-otp";
import type { EmailOtpType } from "@supabase/supabase-js";

interface ConfirmCopy {
  title: string;
  description: string;
  cta: string;
  Icon: typeof MailCheck;
}

/**
 * Fixed, safe copy per link family. Nothing from the URL is ever echoed here,
 * so a tampered `type` can only ever select one of these two known variants.
 */
const COPY: Record<EmailLinkKind, ConfirmCopy> = {
  confirmation: {
    title: "Confirm your email",
    description:
      "For your security, tap the button below to confirm your email address and finish signing in.",
    cta: "Confirm email",
    Icon: MailCheck,
  },
  recovery: {
    title: "Continue to reset your password",
    description:
      "Tap the button below to verify this password-reset link, then choose a new password.",
    cta: "Continue to reset password",
    Icon: KeyRound,
  },
};

/** Recovery action for a dead link: only a password reset offers a fresh reset. */
const RESET_ACTION = {
  label: "Request a new password-reset link",
  href: "/forgot-password",
} as const;

/** Every other dead link (or no type at all) offers a fresh confirmation email. */
const RESEND_ACTION = {
  label: "Resend confirmation email",
  href: "/verify-email",
} as const;

// The strong "primary button" look, applied to a plain anchor: the error card
// has no form to submit, so the CTA is a link, not a button.
const CTA_CLASSES =
  "inline-flex h-11 w-full items-center justify-center rounded-button bg-brand px-5 text-base font-medium text-on-accent shadow-sm transition-colors hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40";

export interface EmailConfirmCardProps {
  tokenHash: string;
  type: EmailOtpType;
  /** Already validated, same-origin relative path — or "" when there is none. */
  next: string;
  /** Server action that verifies the token on submit. */
  action: (formData: FormData) => void | Promise<void>;
}

/**
 * The /auth/confirm card: it holds the untouched one-time token and only
 * verifies it when the user presses the button. Rendered server-side, so the
 * form works as a plain POST even before (or without) hydration.
 */
export function EmailConfirmCard({
  tokenHash,
  type,
  next,
  action,
}: EmailConfirmCardProps) {
  const copy = COPY[emailLinkKind(type)];
  const { Icon } = copy;

  return (
    <div>
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-soft text-brand">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <h1 className="mt-4 text-xl font-semibold text-foreground">{copy.title}</h1>
      <p className="mt-1 text-sm text-muted">{copy.description}</p>

      <form action={action} className="mt-6 flex flex-col gap-4">
        <input type="hidden" name="token_hash" value={tokenHash} />
        <input type="hidden" name="type" value={type} />
        {next && <input type="hidden" name="next" value={next} />}
        <ConfirmSubmitButton>{copy.cta}</ConfirmSubmitButton>
      </form>

      <p className="mt-6 text-center text-xs text-muted">
        Already confirmed?{" "}
        <a href="/login" className="font-medium text-brand hover:underline">
          Sign in
        </a>
      </p>
    </div>
  );
}

export interface EmailConfirmErrorProps {
  /** The validated link type, or null when the URL carried none/unknown. */
  type: EmailOtpType | null;
}

/**
 * Dead-link state for /auth/confirm: the link expired, was already used, was
 * truncated, or carried an unrecognized type.
 *
 * Rendered *in place* rather than redirecting to /login — the proxy sends a
 * signed-in visitor away from /login (to /overview or the 2FA challenge), so a
 * redirect made the failure look like nothing happened at all. Nothing from the
 * URL is echoed and there is no token to submit, so the page stays inert.
 */
export function EmailConfirmError({ type }: EmailConfirmErrorProps) {
  const { label, href } = type === "recovery" ? RESET_ACTION : RESEND_ACTION;

  return (
    <div>
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-danger-soft text-danger">
        <AlertTriangle className="h-5 w-5" aria-hidden="true" />
      </span>
      <h1 className="mt-4 text-xl font-semibold text-foreground">
        This link has expired or was already used
      </h1>
      <p className="mt-1 text-sm text-muted">
        Email links can only be used once and expire shortly after they are sent.
      </p>

      <a href={href} className={`${CTA_CLASSES} mt-6`}>
        {label}
      </a>

      <p className="mt-6 text-center text-xs text-muted">
        <a href="/login" className="font-medium text-brand hover:underline">
          Back to sign in
        </a>
      </p>
    </div>
  );
}
