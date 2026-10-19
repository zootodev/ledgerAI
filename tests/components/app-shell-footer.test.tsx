import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// AppShell renders Sidebar → usePathname, and the footer links point at the
// legal routes served by /privacy and /terms.
vi.mock("next/navigation", () => ({
  usePathname: () => "/overview",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import { AppShell } from "@/components/layout/app-shell";
import { PRIVACY_PATH, TERMS_PATH } from "@/lib/legal/constants";

function render() {
  return renderToStaticMarkup(
    <AppShell header={{ title: "Overview", user: { name: "Ada", email: "ada@example.com" } }}>
      <p>Page content</p>
    </AppShell>,
  );
}

describe("AppShell legal footer (item 6)", () => {
  it("links the privacy notice and terms from every app page", () => {
    const html = render();

    expect(html).toContain(`href="${PRIVACY_PATH}"`);
    expect(html).toContain(">Privacy</a>");
    expect(html).toContain(`href="${TERMS_PATH}"`);
    expect(html).toContain(">Terms</a>");
  });

  it("renders the footer exactly once per page", () => {
    const html = render();

    const occurrences = html.match(/<footer/g) ?? [];
    expect(occurrences).toHaveLength(1);
  });

  it("attributes the footer to the data controller from the legal constants", () => {
    const html = render();
    expect(html).toContain("LedgerAI");
  });
});
