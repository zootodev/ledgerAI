"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  signIn,
  signUp,
  signOut,
  requestPasswordReset,
  updatePassword,
} from "@/lib/services/auth";
import type { AuthResult } from "@/lib/services/auth";
import {
  confirmTotpEnrollment,
  disableTotp,
  startTotpEnrollment,
  verifyMfaChallenge,
} from "@/lib/services/mfa";
import {
  consumeConfiguredLimit,
  getRequestClientIp,
  RATE_LIMIT_EXCEEDED_MESSAGE,
} from "@/lib/security/rate-limit";

export interface AuthFormState {
  error?: string;
  success?: string;
  info?: string;
}

/** State for the 2FA enroll/verify/disable forms (Settings > Security). */
export interface MfaFormState {
  error?: string;
  success?: string;
}

/** State for the enrollment step: carries the QR/secret to display. */
export interface MfaEnrollState extends MfaFormState {
  factorId?: string;
  qrCode?: string;
  secret?: string;
}

/** Only allow an internal, same-origin path as a post-MFA redirect target. */
function safeNext(raw: string): string {
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("://")) {
    return "/overview";
  }
  return raw;
}

export async function loginAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  // Throttle before touching Supabase Auth so a leaked credential or a spray
  // from one IP cannot loop against the auth endpoint.
  const ip = await getRequestClientIp();
  const accountKey = `${email.trim().toLowerCase()}|${ip}`;
  const [byAccount, byIp] = await Promise.all([
    consumeConfiguredLimit("auth:login:account", accountKey),
    consumeConfiguredLimit("auth:login:ip", ip),
  ]);
  if (!byAccount.ok || !byIp.ok) {
    return { error: RATE_LIMIT_EXCEEDED_MESSAGE };
  }

  let mfaRequired = false;
  try {
    const result: AuthResult = await signIn({ email, password });
    if (!result.ok) return { error: result.error };
    mfaRequired = Boolean(result.mfaRequired);
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Unable to sign in right now.",
    };
  }

  // A verified second factor means the password-only session (aal1) may not
  // reach the app: send the user to the challenge before any protected page.
  if (mfaRequired) redirect("/auth/mfa");

  redirect("/overview");
}

export async function signupAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const name = String(formData.get("name") ?? "");

  if (!email || !password) {
    return { error: "Email and password are required." };
  }
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  const ip = await getRequestClientIp();
  const byIp = await consumeConfiguredLimit("auth:signup:ip", ip);
  if (!byIp.ok) {
    return { error: RATE_LIMIT_EXCEEDED_MESSAGE };
  }

  let sessionEstablished = false;
  try {
    const result: AuthResult = await signUp({ email, password, name });
    if (!result.ok) return { error: result.error };
    // Supabase signUp for an existing confirmed email returns intentional
    // "success" with no identities/session and sends no mail. Show the
    // neutral message — never "Account created" and never an enumeration hint.
    if (result.alreadyExists) {
      return {
        info:
          "No account changes were made. If you just signed up, check your inbox for a confirmation link — if you already have an account, sign in below.",
      };
    }
    // A session means confirmation is disabled — go straight to the dashboard.
    // Otherwise the user must confirm their email before their first sign-in.
    sessionEstablished = result.session ?? false;
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Unable to create your account.",
    };
  }

  if (sessionEstablished) redirect("/overview");

  return {
    success:
      "Account created! Check your inbox for a confirmation link to finish signing up.",
  };
}

export async function signOutAction(): Promise<void> {
  await signOut();
  redirect("/login");
}

export async function forgotPasswordAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim();

  if (!email) {
    return { error: "Enter your email address." };
  }

  const ip = await getRequestClientIp();
  const accountKey = `${email.trim().toLowerCase()}|${ip}`;
  const [byAccount, byIp] = await Promise.all([
    consumeConfiguredLimit("auth:reset:account", accountKey),
    consumeConfiguredLimit("auth:reset:ip", ip),
  ]);
  if (!byAccount.ok || !byIp.ok) {
    return { error: RATE_LIMIT_EXCEEDED_MESSAGE };
  }

  try {
    const result = await requestPasswordReset(email);
    if (!result.ok) {
      // Never surface provider errors to the client: this branch maps to the
      // exact same neutral success message so account existence can't be
      // probed through differing error text. Failures stay in the server log
      // for diagnostics only — provider messages never contain recovery
      // tokens or other secrets.
      console.error("[auth] forgot-password: reset request failed", {
        error: result.error,
      });
    }
  } catch (e) {
    console.error("[auth] forgot-password: reset request threw", {
      error: e instanceof Error ? e.message : String(e),
    });
  }

  // Neutral on purpose: we never reveal whether the account exists, and the
  // message is identical whether the request succeeded or failed.
  return {
    success:
      "If an account exists for that email, we've sent a link to reset your password.",
  };
}

export async function updatePasswordAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!password || !confirm) {
    return { error: "Enter and confirm your new password." };
  }
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }
  if (password !== confirm) {
    return { error: "Passwords don't match." };
  }

  try {
    const result = await updatePassword(password);
    if (!result.ok) return { error: result.error };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Unable to update your password right now.",
    };
  }

  return { success: "Your password has been updated. You can sign in now." };
}

/**
 * Complete the login-time MFA challenge. Called from the /auth/mfa page with
 * the 6-digit code; on success the session is promoted to aal2 and the user
 * continues to `next` (or the overview).
 */
export async function verifyMfaAction(
  _prev: MfaFormState,
  formData: FormData,
): Promise<MfaFormState> {
  const code = String(formData.get("code") ?? "");
  const next = safeNext(String(formData.get("next") ?? "/overview"));

  const result = await verifyMfaChallenge(code);
  if (!result.ok) return { error: result.error };

  redirect(next);
}

/**
 * Begin TOTP enrollment (Settings > Security). Returns the QR/secret to show
 * for the authenticator app; the factor is not yet verified.
 */
export async function enrollMfaAction(
  _prev: MfaEnrollState,
  _formData: FormData,
): Promise<MfaEnrollState> {
  const result = await startTotpEnrollment();
  if (!result.ok) return { error: result.error };
  return {
    factorId: result.value.factorId,
    qrCode: result.value.qrCode,
    secret: result.value.secret,
  };
}

/** Confirm a pending TOTP enrollment with a code, turning 2FA on. */
export async function confirmMfaAction(
  _prev: MfaFormState,
  formData: FormData,
): Promise<MfaFormState> {
  const factorId = String(formData.get("factorId") ?? "");
  const code = String(formData.get("code") ?? "");

  const result = await confirmTotpEnrollment(factorId, code);
  if (!result.ok) return { error: result.error };

  revalidatePath("/settings/security");
  return { success: "Two-factor authentication is on." };
}

/** Turn 2FA off. Requires a current code from the authenticator app. */
export async function disableMfaAction(
  _prev: MfaFormState,
  formData: FormData,
): Promise<MfaFormState> {
  const code = String(formData.get("code") ?? "");

  const result = await disableTotp(code);
  if (!result.ok) return { error: result.error };

  revalidatePath("/settings/security");
  return { success: "Two-factor authentication is off." };
}