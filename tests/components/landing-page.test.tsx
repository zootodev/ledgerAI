import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// The landing page is session-aware: it reads the current user to decide
// between the auth CTAs and a shortcut into the books.
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
  it("uses five sections, led by a real overview screenshot", () => {
    expect(html.match(/<section/g)?.length).toBe(5);
    expect(html).toContain("Your bank statements, in one set of books.");
    expect(html).toContain("product-overview.png");
    expect(html).toContain("A sample bakery&#x27;s October, imported from a GTBank CSV.");
    expect(html).toContain("ledgerai-zootodev.vercel.app/overview");
    expect(html).not.toContain("app.ledgerai.ng");
  });

  it("explains the import as four numbered steps, not a feature-card grid", () => {
    expect(html).toContain("From statement to ledger, without retyping it.");
    for (const step of [
      "Choose the file",
      "Map only what is missing",
      "Check the duplicates",
      "Commit the rows",
    ]) {
      expect(html).toContain(step);
    }
    expect(html).toContain("A POS settlement imported twice is caught");
    expect(html).toContain('href="#import"');
    expect(html).toContain("See how import works");
    expect(html).not.toContain("See the import screen");
  });

  it("shows an insights example with real-looking figures and named rows", () => {
    expect(html).toContain("A page you can read before month end.");
    expect(html).toContain("Transport cost ₦22,400 more than October.");
    expect(html).toContain("₦355,550");
    expect(html).toContain("₦35,860");
    expect(html).toContain("No change");
  });

  it("removed the on-hold Ask card and the old trend mock", () => {
    expect(html).not.toContain("Ask your ledger");
    expect(html).not.toContain("Coming soon");
    expect(html).not.toContain("Monthly trend");
    expect(html).not.toContain("₦120k");
  });

  it("states the security limits in plain language", () => {
    expect(html).toContain("Your statements stay yours.");
    expect(html).toContain("LedgerAI does not connect to your bank and cannot move money.");
    expect(html).toContain("another business cannot open them");
  });

  it("links privacy and terms from the footer", () => {
    expect(html).toContain('href="/privacy"');
    expect(html).toContain('href="/terms"');
  });

  it("shows the auth CTAs in the header for a signed-out visitor", () => {
    const header = headerOf(html);
    expect(header).toContain('href="/login"');
    expect(header).toContain("Sign in");
    expect(header).toContain('href="/signup"');
    expect(header).toContain("Start with a statement");
    expect(header).not.toContain("Open your books");
  });

  it("swaps the header CTAs for a books shortcut when signed in", async () => {
    const signedIn = await renderSignedIn();
    const header = headerOf(signedIn);
    expect(header).toContain('href="/overview"');
    expect(header).toContain("Open your books");
    expect(header).not.toContain('href="/login"');
    expect(header).not.toContain('href="/signup"');
  });

  it("never redirects a signed-in visitor away from the marketing page", async () => {
    const signedIn = await renderSignedIn();
    expect(signedIn).toContain(
      "Your bank statements, in one set of books.",
    );
    expect(headerOf(signedIn)).toContain("Open your books");
  });

  it("still renders the landing page when the session lookup fails", async () => {
    mockedGetCurrentUser.mockRejectedValue(new Error("supabase down"));
    const rendered = renderToStaticMarkup(await Home());
    expect(headerOf(rendered)).toContain("Start with a statement");
  });
});
