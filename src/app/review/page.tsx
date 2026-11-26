import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { signOutAction } from "@/lib/auth/actions";
import { ensureOnboarding } from "@/lib/services/auth";
import { requireAuthContext } from "@/lib/services/auth-context";
import { listCategories } from "@/lib/services/categories";
import { listReviewGroups } from "@/lib/services/review";
import { ReviewView } from "@/components/review/review-view";

export const metadata: Metadata = {
  title: "Quick review",
};

export default async function ReviewPage() {
  await ensureOnboarding();
  const ctx = await requireAuthContext().catch(() => null);
  if (!ctx) redirect("/login");

  const [groups, categories] = await Promise.all([
    listReviewGroups().catch(() => ({
      groups: [],
      totalGroups: 0,
      totalRows: 0,
      totalAmount: 0,
    })),
    listCategories().catch(() => []),
  ]);

  return (
    <ReviewView
      initialGroups={groups.groups}
      totalGroups={groups.totalGroups}
      totalRows={groups.totalRows}
      totalAmount={groups.totalAmount}
      categories={categories}
      currency={ctx.business.currency}
      userName={ctx.user.name ?? undefined}
      userEmail={ctx.user.email}
      businessName={ctx.business.name}
      onSignOut={signOutAction}
    />
  );
}
