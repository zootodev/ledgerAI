import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// The landing page is now session-aware: it reads the current user to decide
// between the auth CTAs and a "Go to dashboard" shortcut.
vi.mock("@/lib/auth/server", () => ({
  getCurrentUser: vi.fn(),
}));

import { getCurrentUser } from "@/lib/auth/server";
import Home from "@/app/page";

const mockedGetCurrentUser = vi.mocked(getCurrentUser);

/** Render the async server component to static HTML for a signed-out visitor. */
async function renderSignedOut(): Promise<string> {
  mockedGetCurrentUser.mockResolvedValue(null);
  return renderToStaticMarkup(await Home());
}

/** Render the async server component to static HTML for a signed-in visitor. */
async function renderSignedIn(): Promise<string> {
  mockedGetCurrentUser.mockResolvedValue({
    id: "user-1",
    email: "ada@example.com",
    name: "Ada Lovelace",
  } as never);
  return renderToStaticMarkup(await Home());
}

/** Slice out the top marketing header so nav assertions stay scoped to it. */
function headerOf(html: string): string {
  const start = html.indexOf("<header");
  const end = html.indexOf("</header>");
  return html.slice(start, end);
}

let html = "";

beforeEach(async () => {
  vi.clearAllMocks();
  html = await renderSignedOut();
});

describe("landing page", () => {
  it("promises plain-language insights instead of the on-hold Ask feature", () => {
    expect(html).toContain("plain-language insights");
    expect(html).not.toContain("plain-language answers");
  });

  it("labels the Ask card as Coming soon rather than a shipped feature", () => {
    expect(html).toContain("Ask your ledger");
    expect(html).toContain("Coming soon");
    // The title no longer claims the feature exists today.
    expect(html).not.toContain("Ask your ledger — coming soon");
  });

  it("renders a labelled monthly trend (months + naira axis)", () => {
    for (const month of ["May", "Jun", "Jul", "Aug", "Sep", "Oct"]) {
      expect(html).toContain(month);
    }
    expect(html).toContain("₦120k");
    expect(html).toContain("Monthly trend");
  });

  it("links privacy, terms and contact from the footer", () => {
    expect(html).toContain('href="/privacy"');
    expect(html).toContain('href="/terms"');
    expect(html).toContain("mailto:ifeoluwaniolufunmilayo@gmail.com");
  });

  it("shows a hero product preview only on large screens", () => {
    expect(html).toContain("lg:grid-cols-2");
    expect(html).toContain("hidden lg:block");
    expect(html).toContain("₦1,240,000");
    expect(html).toContain("₦612,400");
    expect(html).toContain("₦627,600");
  });

  it("keeps three-card rows at 1 column below sm and 2 columns at sm", () => {
    expect(html).toContain("sm:grid-cols-2 lg:grid-cols-3");
  });

  it("shows the auth CTAs in the header for a signed-out visitor", () => {
    const header = headerOf(html);
    expect(header).toContain('href="/login"');
    expect(header).toContain("Sign in");
    expect(header).toContain('href="/signup"');
    expect(header).toContain("Get started");
    expect(header).not.toContain("Go to dashboard");
  });

  it("swaps the header CTAs for a dashboard shortcut when signed in", async () => {
    const signedIn = await renderSignedIn();
    const header = headerOf(signedIn);
    expect(header).toContain('href="/overview"');
    expect(header).toContain("Go to dashboard");
    expect(header).not.toContain('href="/login"');
    expect(header).not.toContain('href="/signup"');
  });

  it("never redirects a signed-in visitor away from the marketing page", async () => {
    const signedIn = await renderSignedIn();
    // The full marketing surface still renders (it was not redirected).
    expect(signedIn).toContain("Know exactly where your business stands.");
    expect(headerOf(signedIn)).toContain("Go to dashboard");
  });

  it("still renders the landing page when the session lookup fails", async () => {
    mockedGetCurrentUser.mockRejectedValue(new Error("supabase down"));
    const rendered = renderToStaticMarkup(await Home());
    expect(headerOf(rendered)).toContain("Get started");
  });
});
