import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) =>
    createElement("a", { href }, children),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/overview",
  useRouter: () => ({ push: vi.fn() }),
}));

import { OverviewShell } from "@/components/dashboard/overview-shell";

describe("Overview headings", () => {
  it("renders exactly one H1 (the app header), with the business name below it", () => {
    const html = renderToStaticMarkup(
      createElement(OverviewShell, {
        userName: "Ada",
        userEmail: "ada@example.com",
        businessName: "Acme",
        currency: "NGN",
        kpis: null,
      }),
    );

    expect(html.match(/<h1\b/g) ?? []).toHaveLength(1);
    expect(html.match(/<h2\b/g) ?? []).toHaveLength(1);
    expect(html).toContain(">Acme</h2>");
  });
});
