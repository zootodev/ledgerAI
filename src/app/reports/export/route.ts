import { NextResponse } from "next/server";
import { getAppBaseUrl } from "@/lib/auth/app-url";
import { requireAuthContext } from "@/lib/services/auth-context";
import {
  consumeConfiguredLimit,
  RATE_LIMIT_EXCEEDED_MESSAGE,
} from "@/lib/security/rate-limit";
import { analyticsQuerySchema, zErrorMessage } from "@/lib/validation/index";
import {
  REPORT_TYPES,
  buildCategoryCsv,
  buildExpenseCsv,
  buildIncomeCsv,
  buildMonthlyCsv,
  buildProfitCsv,
  buildSummaryCsv,
  getReportData,
  slugAccountName,
  type ReportType,
} from "@/lib/services/reports";

/**
 * GET /reports/export?type=summary|monthly|category|income|expense|profit[&from=&to=]
 *
 * Downloads the requested report section as a CSV attachment for the current
 * user's business. Dates use the same YYYY-MM-DD range convention as the
 * Overview; an absent range means all time. Unauthenticated callers are
 * redirected to the sign-in page like every other authenticated surface.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const rawType = url.searchParams.get("type");
  const dateFrom = param(url, "from");
  const dateTo = param(url, "to");
  const accountId = param(url, "accountId");

  if (!REPORT_TYPES.includes(rawType as ReportType)) {
    return NextResponse.json(
      {
        error:
          "Unknown report type. Use summary, monthly, category, income, expense or profit.",
      },
      { status: 400 },
    );
  }
  const type = rawType as ReportType;

  const parsed = analyticsQuerySchema.safeParse({ dateFrom, dateTo, accountId });
  if (!parsed.success) {
    return NextResponse.json({ error: zErrorMessage(parsed.error) }, { status: 400 });
  }

  const ctx = await requireAuthContext().catch(() => null);
  if (!ctx) {
    const baseUrl = await getAppBaseUrl();
    return NextResponse.redirect(new URL("/login", baseUrl).toString());
  }

  const limit = await consumeConfiguredLimit("export:csv", ctx.business.id);
  if (!limit.ok) {
    return NextResponse.json(
      { error: RATE_LIMIT_EXCEEDED_MESSAGE },
      {
        status: 429,
        headers: { "Retry-After": String(limit.retryAfterSeconds) },
      },
    );
  }

  // Account scoping is validated against the session business so a foreign id
  // can never leak another tenant's rows or appear in the filename.
  let accountName: string | null = null;
  if (parsed.data.accountId) {
    const account = await ctx.prisma.account.findFirst({
      where: {
        id: parsed.data.accountId,
        businessId: ctx.business.id,
      },
      select: { name: true },
    });
    if (!account) {
      return NextResponse.json({ error: "Unknown account." }, { status: 400 });
    }
    accountName = account.name;
  }

  const data = await getReportData(parsed.data);
  const csv =
    type === "summary"
      ? buildSummaryCsv(data.summary)
      : type === "monthly"
        ? buildMonthlyCsv(data.monthly)
        : type === "category"
          ? buildCategoryCsv(data.category)
          : type === "income"
            ? buildIncomeCsv(data.income)
            : type === "expense"
              ? buildExpenseCsv(data.expense)
              : buildProfitCsv(data.profit);

  const filename = [
    "ledgerai-report",
    type,
    parsed.data.dateFrom ?? "all",
    parsed.data.dateTo ?? "all",
    accountName ? slugAccountName(accountName) : null,
  ].filter(Boolean);

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename.join("-")}.csv"`,
    },
  });
}

/** URL query param as a string, dropping empty values. */
function param(url: URL, name: string): string | undefined {
  const value = url.searchParams.get(name);
  return value && value.length > 0 ? value : undefined;
}