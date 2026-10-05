import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ReportsError from "@/app/reports/error";

function renderWith(message: string, digest?: string) {
  return renderToStaticMarkup(
    <ReportsError
      error={{ message, ...(digest ? { digest } : {}) } as Error & {
        digest?: string;
      }}
      reset={() => {}}
    />,
  );
}

describe("reports/error route boundary", () => {
  it("renders a safe message and a retry action (apostrophe HTML-encoded)", () => {
    const html = renderWith("boom");
    expect(html).toContain("couldn");
    expect(html).toContain("Try again");
  });

  it("never leaks the underlying error message or stack", () => {
    const html = renderWith("prisma: db conn timeout on biz-a SELECT ...");
    expect(html).not.toContain("prisma");
    expect(html).not.toContain("biz-a");
    expect(html).not.toContain("SELECT");
  });

  it("never renders the digest id or any server-side error text", () => {
    const html = renderWith("secret: connection string postgres://u:p@…", "trace-42");
    expect(html).not.toContain("trace-42");
    expect(html).not.toContain("postgres://");
    expect(html).not.toContain("secret:");
  });
});