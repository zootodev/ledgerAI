"use server";

import { redirect } from "next/navigation";
import { signIn, signUp, signOut } from "@/lib/services/auth";
import type { AuthResult } from "@/lib/services/auth";

export interface AuthFormState {
  error?: string;
  success?: string;
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
    success: "Account created! If email confirmation is enabled, check your inbox.",
  };
}

export async function signOutAction(): Promise<void> {
  await signOut();
  redirect("/login");
}