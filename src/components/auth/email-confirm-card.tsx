import { MailCheck, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
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
        <Button type="submit" fullWidth>
          {copy.cta}
        </Button>
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
