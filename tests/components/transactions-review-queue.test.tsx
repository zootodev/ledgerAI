import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// ============================================================
// Review queue (?lowConfidence=1 / ?status=review) — item 5 of
// the pre-launch UX pass: honest 75% copy and per-row controls
// (Accept + a category-only dropdown) that don't open the edit
// dialog.
// ============================================================

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/transactions",
}));

vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

vi.mock("@/lib/actions/transactions", () => ({
  deleteTransactionAction: vi.fn(),
  confirmTransactionCategoryAction: vi.fn().mockResolvedValue({ ok: true }),
  setTransactionCategoryAction: vi.fn().mockResolvedValue({ ok: true }),
}));

import { TransactionsView } from "@/components/transactions/transactions-view";
import type { TransactionServiceData } from "@/lib/services/transactions";
import type { TransactionListQuery } from "@/lib/validation/transaction";

const BUSINESS = "11111111-1111-4111-8111-111111111111";

function makeTx(overrides: Partial<TransactionServiceData> = {}): TransactionServiceData {
  return {
    id: "tx-1",
    businessId: BUSINESS,
    accountId: null,
    date: "2026-08-01",
    description: "UBER *TRIP",
    amount: "2500.00",
    type: "expense",
    categoryId: "cat-1",
    source: "csv",
    reference: null,
    notes: null,
    aiCategory: "Transport",
    aiConfidence: 0.42,
    fingerprint: null,
    createdAt: "2026-08-02T00:00:00.000Z",
    updatedAt: "2026-08-02T00:00:00.000Z",
    ...overrides,
  };
}

const CATEGORIES = [
  { id: "cat-1", name: "Transport", type: "expense" as const, isSystem: false },
  { id: "cat-2", name: "Food", type: "expense" as const, isSystem: false },
  { id: "cat-3", name: "Sales", type: "income" as const, isSystem: true },
];

function render(params: Record<string, string | number | undefined>) {
  return renderToStaticMarkup(
    <TransactionsView
      result={{
        items: [makeTx()],
        total: 1,
        page: 1,
        pageSize: 20,
        pages: 1,
        totals: { income: 0, expense: 2500, net: -2500, transfer: 0 },
      }}
      params={
        {
          page: 1,
          pageSize: 20,
          sortBy: "date",
          sortDir: "desc",
          ...params,
        } as TransactionListQuery
      }
      accounts={[]}
      categories={CATEGORIES}
      currency="NGN"
      title="Transactions"
      userEmail="user@example.com"
      businessName="Test Ltd"
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("review queue copy (the real 75% threshold)", () => {
  it("explains the AI · % badge at 75%, not a rounded 80%", () => {
    const html = render({ lowConfidence: "1" });
    expect(html).toContain(
      "The AI · % badge shows how confident the AI is in its category. Anything under 75% lands here.",
    );
    expect(html).not.toContain("80%");
  });

  it("still shows the AI · 42% badge for a low-confidence row", () => {
    const html = render({ lowConfidence: "1" });
    expect(html).toContain("AI · 42%");
  });
});

describe("per-row review controls", () => {
  it("renders an Accept control and a category-only dropdown per row in review mode", () => {
    const html = render({ lowConfidence: "1" });

    // Category-only dropdown: labeled per row, no dialog involved.
    expect(html).toContain('aria-label="Category for UBER *TRIP"');
    // Accept keeps the suggested category and confirms the row.
    expect(html).toContain(">Accept</button>");
  });

  it("offers only categories that match the row type", () => {
    const html = render({ lowConfidence: "1" });

    const selectStart = html.indexOf('aria-label="Category for UBER *TRIP"');
    const selectEnd = html.indexOf("</select>", selectStart);
    const select = html.slice(selectStart, selectEnd);

    expect(select).toContain("Transport");
    expect(select).toContain("Food");
    // An income category can't apply to an expense row.
    expect(select).not.toContain("Sales");
  });

  it("offers an Uncategorized choice so a wrong suggestion can be cleared", () => {
    const html = render({ lowConfidence: "1" });
    expect(html).toContain('<option value="">Uncategorized</option>');
  });

  it("hides the controls outside the review queue (normal list keeps badges)", () => {
    const html = render({});

    expect(html).not.toContain(">Accept</button>");
    expect(html).not.toContain('aria-label="Category for UBER *TRIP"');
    expect(html).toContain("Transport");
  });

  it("keeps the ?status=review alias behaving like lowConfidence=1", () => {
    // The page canonicalizes ?status=review to lowConfidence=1; the view must
    // key its review affordances off that canonical param.
    const html = render({ lowConfidence: "1", status: "review" });
    expect(html).toContain(">Accept</button>");
  });
});
