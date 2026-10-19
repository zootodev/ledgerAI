import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const sentryMock = vi.hoisted(() => ({ captureException: vi.fn() }));

vi.mock("@sentry/nextjs", () => ({
  captureException: sentryMock.captureException,
}));

import { reportHandledError } from "@/lib/observability/server-report";

const originalPublic = process.env.NEXT_PUBLIC_SENTRY_DSN;
const originalServer = process.env.SENTRY_DSN;

beforeEach(() => {
  delete process.env.NEXT_PUBLIC_SENTRY_DSN;
  delete process.env.SENTRY_DSN;
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  if (originalPublic === undefined) delete process.env.NEXT_PUBLIC_SENTRY_DSN;
  else process.env.NEXT_PUBLIC_SENTRY_DSN = originalPublic;
  if (originalServer === undefined) delete process.env.SENTRY_DSN;
  else process.env.SENTRY_DSN = originalServer;
  vi.restoreAllMocks();
});

async function flush() {
  await new Promise((resolve) => setTimeout(resolve, 10));
}

describe("reportHandledError", () => {
  it("does not load the SDK when monitoring is off, and never throws", async () => {
    expect(() => reportHandledError("import.load.context", new Error("boom"))).not.toThrow();
    await flush();
    expect(sentryMock.captureException).not.toHaveBeenCalled();
  });

  it("reports the error to Sentry marked as handled", async () => {
    process.env.SENTRY_DSN = "https://public@example.ingest.sentry.io/1";
    const error = new Error("connection pool exhausted");

    reportHandledError("import.load.data", error);
    await flush();

    expect(sentryMock.captureException).toHaveBeenCalledTimes(1);
    const [captured, options] = sentryMock.captureException.mock.calls[0];
    expect(captured).toBe(error);
    expect(options).toMatchObject({
      mechanism: { handled: true, type: "import.load.data" },
    });
  });
});
