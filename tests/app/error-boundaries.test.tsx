import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import AppError from "@/app/error";
import GlobalError from "@/app/global-error";

function renderAppError(message: string, digest?: string) {
  return renderToStaticMarkup(
    <AppError
      error={{ message, ...(digest ? { digest } : {}) } as Error & {
        digest?: string;
      }}
      reset={() => {}}
    />,
  );
}

function renderGlobalError(message: string, digest?: string) {
  return renderToStaticMarkup(
    <GlobalError
      error={{ message, ...(digest ? { digest } : {}) } as Error & {
        digest?: string;
      }}
      reset={() => {}}
    />,
  );
}

describe("root error boundary", () => {
  it("renders a safe message, a retry action and a way back to the app", () => {
    const html = renderAppError("boom");
    expect(html).toContain("Something went wrong");
    expect(html).toContain("Try again");
    expect(html).toContain('href="/overview"');
    expect(html).toContain("Back to overview");
  });

  it("never leaks the underlying error message, stack or digest", () => {
    const html = renderAppError(
      "prisma: db conn timeout on biz-a SELECT ...",
      "digest-123",
    );
    expect(html).not.toContain("prisma");
    expect(html).not.toContain("biz-a");
    expect(html).not.toContain("SELECT");
    expect(html).not.toContain("digest-123");
  });
});

describe("global error boundary", () => {
  it("renders its own document with a retry action and a link home", () => {
    const html = renderGlobalError("boom");
    expect(html).toContain("<html");
    expect(html).toContain("<body");
    expect(html).toContain("Try again");
    expect(html).toContain('href="/"');
    expect(html).toContain("Back to home");
  });

  it("never leaks the underlying error message or digest", () => {
    const html = renderGlobalError(
      "secret: connection string postgres://user:pass@host/db",
      "digest-999",
    );
    expect(html).not.toContain("postgres://");
    expect(html).not.toContain("secret");
    expect(html).not.toContain("digest-999");
  });
});
