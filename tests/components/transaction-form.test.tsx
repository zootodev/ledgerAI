import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/lib/actions/transactions", () => ({
  createTransactionAction: vi.fn(),
  updateTransactionAction: vi.fn(),
}));

// Modal renders into a document.body portal (unavailable in the node test
// env), so inline its children for a static render of the form markup.
vi.mock("@/components/ui/modal", async () => {
  const React = await import("react");
  return {
    Modal: ({
      children,
      footer,
    }: {
      children: React.ReactNode;
      footer?: React.ReactNode;
    }) => React.createElement("div", null, footer, children),
  };
});

import { TransactionForm } from "@/components/transactions/transaction-form";

function render() {
  return renderToStaticMarkup(
    <TransactionForm
      open
      onClose={() => {}}
      accounts={[{ id: "acc-1", name: "Main wallet" }]}
      categories={[{ id: "cat-1", name: "Sales", type: "income" }]}
      onSaved={() => {}}
    />,
  );
}

describe("TransactionForm submit wiring (#1)", () => {
  it("places the submit control inside the <form> so click and Enter both submit", () => {
    const html = render();

    const formStart = html.indexOf("<form");
    const formEnd = html.indexOf("</form>");
    expect(formStart).toBeGreaterThan(-1);
    expect(formEnd).toBeGreaterThan(formStart);

    const insideForm = html.slice(formStart, formEnd);
    expect(insideForm).toContain('type="submit"');
    expect(insideForm).toContain("Add transaction");
    expect(insideForm).toContain("Cancel");
  });

  it("does not rely on cross-element form= wiring from a footer sibling", () => {
    const html = render();
    // The legacy bug wired the footer submit button to the form with a
    // `form="transaction-form"` attribute; it must be gone.
    expect(html).not.toContain('form="transaction-form"');
  });
});
