import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const sentryMock = vi.hoisted(() => ({ captureException: vi.fn() }));

vi.mock("@sentry/nextjs", () => ({
  captureException: sentryMock.captureException,
}));

import { captureException } from "@/lib/observability/capture";

const originalDsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

beforeEach(() => {
  delete process.env.NEXT_PUBLIC_SENTRY_DSN;
  vi.clearAllMocks();
});

afterEach(() => {
  if (originalDsn === undefined) delete process.env.NEXT_PUBLIC_SENTRY_DSN;
  else process.env.NEXT_PUBLIC_SENTRY_DSN = originalDsn;
});

async function flush() {
  // Let the lazily-imported SDK module load and its floating promise settle.
  await new Promise((resolve) => setTimeout(resolve, 10));
}

describe("captureException", () => {
  it("does not load or call the SDK when monitoring is not configured", async () => {
    captureException(new Error("boom"));
    await flush();
    expect(sentryMock.captureException).not.toHaveBeenCalled();
  });

  it("forwards the error to Sentry once a DSN is configured", async () => {
    process.env.NEXT_PUBLIC_SENTRY_DSN = "https://public@example.com/1";
    const error = new Error("boom");

    captureException(error);
    await flush();

    expect(sentryMock.captureException).toHaveBeenCalledWith(error);
  });

  it("never throws, even for arbitrary error shapes", async () => {
    process.env.NEXT_PUBLIC_SENTRY_DSN = "https://public@example.com/1";
    for (const value of [undefined, null, "string", { weird: true }]) {
      expect(() => captureException(value)).not.toThrow();
    }
    await flush();
  });
});
