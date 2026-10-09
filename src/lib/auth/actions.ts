"use server";

import { redirect } from "next/navigation";
import {
  signIn,
  signUp,
  signOut,
  requestPasswordReset,
  updatePassword,
} from "@/lib/services/auth";
import type { AuthResult } from "@/lib/services/auth";
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

  try {
    const result: AuthResult = await signIn({ email, password });
    if (!result.ok) return { error: result.error };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Unable to sign in right now.",
    };
  }

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