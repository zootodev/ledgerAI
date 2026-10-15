import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ usePathname: () => "/reports" }));

import { Sidebar } from "@/components/layout/sidebar";

describe("Sidebar", () => {
  const html = renderToStaticMarkup(<Sidebar />);

  it("renders the finished product surfaces", () => {
    for (const label of ["Overview", "Transactions", "Reports", "Import", "Settings"]) {
      expect(html).toContain(`>${label}<`);
    }
  });

  it("never links to the hidden Ask surfaces", () => {
    expect(html).not.toContain("/ask");
    expect(html).not.toContain("Ask LedgerAI");
  });
});
