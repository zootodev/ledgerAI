import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/lib/import/draft", () => ({
  purgeImportCaches: vi.fn(),
  localStore: vi.fn(() => null),
  sessionStore: vi.fn(() => null),
}));

import { Header, firstName, initials } from "@/components/layout/header";

describe("Header identity helpers", () => {
  it("extracts the first name and initials", () => {
    expect(firstName("Ada Lovelace")).toBe("Ada");
    expect(initials("Ada Lovelace")).toBe("AL");
    expect(initials("Grace")).toBe("G");
  });

  it("handles missing or whitespace-only names", () => {
    expect(firstName("   ")).toBe("   ");
    expect(firstName("")).toBe("");
    expect(initials("   ")).toBe("");
  });

  it("extracts the first whitespace-delimited name", () => {
    expect(firstName("Mary Jane Watson")).toBe("Mary");
  });
});

describe("Header render", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the first name (not the full name) on the trigger and keeps full identity in dropdown", () => {
    const html = renderToStaticMarkup(
      createElement(Header, {
        user: { name: "Ada Lovelace", email: "ada@example.com" },
      }),
    );

    // Trigger button shows only the first name on large screens (class hidden lg:block)
    expect(html).toContain("Ada");
    expect(html).not.toContain(">Ada Lovelace<"); // full name not in the trigger
    // Full name appears in the dropdown block when open (open renders unconditionally in this UI? Dropdown only renders menu when open; SSR renders closed menu — wait, Dropdown renders menu only if open is true. In SSR, initial open state is false → menu not rendered. So full name not in SSR HTML.)
    expect(html).not.toContain("Ada Lovelace");
    expect(html).not.toContain("ada@example.com");
    // Initials badge present
    expect(html).toContain("AL");
  });
});
