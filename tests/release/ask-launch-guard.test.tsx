// ============================================================
// LedgerAI — Ask launch guard
// ------------------------------------------------------------
// One file that locks the LAUNCH POSTURE of the deliberately hidden
// Ask feature:
//   - it is not navigable (no sidebar entry);
//   - the hidden routes are kept out of search indexes;
//   - the v1/v2 server gates default OFF and accept only explicit
//     truthy values.
//
// Deeper behavioural coverage lives in the focused suites (nav
// constants, route redirects, disabled-action no-side-effects, RLS,
// conversation tenant scoping). This suite is the single, readable
// place a release reviewer can point at for "Ask stays off".
// ============================================================

import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/services/auth", () => ({ ensureOnboarding: vi.fn() }));
vi.mock("@/lib/services/auth-context", () => ({ requireAuthContext: vi.fn() }));

import { metadata as askMetadata } from "@/app/ask/page";
import { metadata as askV2Metadata } from "@/app/ask-v2/page";
import { NAV_ITEMS } from "@/constants/navigation";
import { isAskEnabled } from "@/lib/ask/config";
import { isAskV2Enabled } from "@/lib/ask-v2/config";

function env(values: Record<string, string>): NodeJS.ProcessEnv {
  return values as unknown as NodeJS.ProcessEnv;
}

describe("Ask is not navigable at launch", () => {
  it("never appears in the navigation model", () => {
    for (const item of NAV_ITEMS) {
      expect(item.href.startsWith("/ask")).toBe(false);
      expect(item.label.toLowerCase()).not.toContain("ask");
    }
  });
});

describe("hidden Ask routes are kept out of search indexes", () => {
  const cases: Array<[string, typeof askMetadata]> = [
    ["/ask", askMetadata],
    ["/ask-v2", askV2Metadata],
  ];

  for (const [path, meta] of cases) {
    it(`${path} is robots noindex, nofollow`, () => {
      expect(meta.robots).toMatchObject({ index: false, follow: false });
    });
  }
});

describe("Ask server gates default OFF", () => {
  it("v1 and v2 are both disabled for an empty environment", () => {
    expect(isAskEnabled(env({}))).toBe(false);
    expect(isAskV2Enabled(env({}))).toBe(false);
    expect(isAskEnabled(env({ ASK_ENABLED: "" }))).toBe(false);
    expect(isAskV2Enabled(env({ ASK_V2_ENABLED: "" }))).toBe(false);
  });

  it("only explicit truthy values enable a gate", () => {
    for (const value of ["1", "true", "yes", "on", "TRUE", "On"]) {
      expect(isAskEnabled(env({ ASK_ENABLED: value }))).toBe(true);
      expect(isAskV2Enabled(env({ ASK_V2_ENABLED: value }))).toBe(true);
    }
    for (const value of ["0", "false", "no", "off", "enabled", "maybe", "  true  "]) {
      expect(isAskEnabled(env({ ASK_ENABLED: value }))).toBe(false);
      expect(isAskV2Enabled(env({ ASK_V2_ENABLED: value }))).toBe(false);
    }
  });
});
