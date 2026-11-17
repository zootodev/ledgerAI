import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/auth/supabase";
import {
  LAST_SEEN_COOKIE,
  lastSeenCookieOptions,
  resolveSessionLimits,
  shouldRefreshLastSeen,
  signLastSeen,
  verifyLastSeen,
} from "@/lib/auth/session-limits";

/**
 * POST /api/session/ping — activity signal for the idle-warning component.
 *
 * The proxy enforces the absolute/idle limits before this handler runs, so an
 * already-expired session is redirected rather than revived by a ping. This
 * handler only moves the signed last-seen timestamp forward for a session that
 * is still valid, and answers with a bodyless, uncached 204.
 */

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

function empty(status: number): NextResponse {
  return new NextResponse(null, { status, headers: NO_STORE_HEADERS });
}

/** Browser POSTs must originate from this app; non-browser probes may omit Origin. */
function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      return new URL(origin).origin === request.nextUrl.origin;
    } catch {
      return false;
    }
  }

  const fetchSite = request.headers.get("sec-fetch-site");
  return !fetchSite || fetchSite === "same-origin";
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return empty(403);

  const supabase = await getSupabaseServer();
  if (!supabase) return empty(401);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return empty(401);

  const limits = resolveSessionLimits();
  const response = empty(204);

  // Without a signing secret the proxy does not enforce idle time either, so
  // there is no last-seen cookie to refresh. The ping still confirms activity.
  if (!limits.secret) return response;

  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(LAST_SEEN_COOKIE)?.value;
  const verifiedAt = cookieValue
    ? await verifyLastSeen(limits.secret, user.id, cookieValue)
    : null;
  const now = Date.now();

  if (verifiedAt === null || shouldRefreshLastSeen(verifiedAt, now)) {
    response.cookies.set(
      LAST_SEEN_COOKIE,
      await signLastSeen(limits.secret, user.id, now),
      lastSeenCookieOptions(
        limits.maxAgeMs,
        process.env.NODE_ENV === "production",
      ),
    );
  }

  return response;
}
