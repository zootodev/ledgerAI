import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/server";
import {
  consumeConfiguredLimit,
  getRequestClientIp,
  RATE_LIMIT_EXCEEDED_MESSAGE,
} from "@/lib/security/rate-limit";
import { exportAccountData, exportToCsv } from "@/lib/services/account";

/**
 * GET /account/export?format=json|csv
 *
 * Downloads the signed-in user's own data (businesses, accounts, categories,
 * transactions, imports, insights, rules) as a file attachment. Scoping comes
 * from the session only — a caller can never request another tenant's data.
 * Unauthenticated callers are bounced to the sign-in page.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const url = new URL(request.url);
  const format = url.searchParams.get("format") === "csv" ? "csv" : "json";

  const ip = await getRequestClientIp();
  const decision = await consumeConfiguredLimit("account:export", `${user.id}|${ip}`);
  if (!decision.ok) {
    return new NextResponse(RATE_LIMIT_EXCEEDED_MESSAGE, { status: 429 });
  }

  const data = await exportAccountData();
  if (!data) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const stamp = new Date().toISOString().slice(0, 10);

  if (format === "csv") {
    return new NextResponse(exportToCsv(data), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="ledgerai-export-${stamp}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  }

  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="ledgerai-export-${stamp}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
