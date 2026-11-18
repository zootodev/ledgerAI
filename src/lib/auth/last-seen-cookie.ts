import { cookies } from "next/headers";
import { LAST_SEEN_COOKIE } from "./session-limits";

/**
 * Drop the idle-timeout cookie at a session boundary (sign-in, sign-out,
 * OAuth/email callback). The proxy also ignores a last-seen value older than
 * the current sign-in, so this is hygiene, not the only guard. Never throws:
 * a cookie-store failure must not block signing in or out.
 */
export async function clearLastSeenCookie(): Promise<void> {
  try {
    const store = await cookies();
    store.set(LAST_SEEN_COOKIE, "", {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: process.env.NODE_ENV === "production",
      maxAge: 0,
    });
  } catch {
    // Outside a request scope (tests, build) there is no cookie store.
  }
}
