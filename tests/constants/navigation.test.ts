import { describe, expect, it } from "vitest";
import { NAV_ITEMS, NAV_SECTIONS } from "@/constants/navigation";

describe("navigation constants", () => {
  it("lists only finished, user-facing product surfaces", () => {
    expect(NAV_ITEMS.map((item) => item.href)).toEqual([
      "/overview",
      "/transactions",
      "/income",
      "/expenses",
      "/reports",
      "/insights",
      "/import",
      "/settings",
    ]);
  });

  it("never exposes the hidden Ask surfaces in navigation", () => {
    for (const item of NAV_ITEMS) {
      expect(item.href.startsWith("/ask")).toBe(false);
      expect(item.label.toLowerCase()).not.toContain("ask");
      expect(item.badge).toBeUndefined();
    }
  });

  it("every item is routed through a section exactly once", () => {
    const seen = new Set<string>();
    for (const section of NAV_SECTIONS) {
      for (const item of section.items) {
        expect(seen.has(item.href)).toBe(false);
        seen.add(item.href);
      }
    }
    expect(seen.size).toBe(NAV_ITEMS.length);
  });
});
