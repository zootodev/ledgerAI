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

  try {
    const result = await requestPasswordReset(email);
    if (!result.ok) return { error: result.error };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Unable to send a reset link right now.",
    };
  }

  // Neutral on purpose: we never reveal whether the account exists.
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