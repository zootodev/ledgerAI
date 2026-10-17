import { describe, expect, it } from "vitest";
import type { ErrorEvent } from "@sentry/nextjs";
import {
  clientSentryOptions,
  resolveSentryDsn,
  resolveSentryEnvironment,
  resolveTracesSampleRate,
  scrubEvent,
  serverSentryOptions,
  stripUrlSecrets,
} from "@/lib/observability/sentry-options";

describe("resolveSentryDsn", () => {
  it("is undefined (monitoring off) when no DSN is configured", () => {
    expect(resolveSentryDsn({})).toBeUndefined();
    expect(resolveSentryDsn({ NEXT_PUBLIC_SENTRY_DSN: "  " })).toBeUndefined();
  });

  it("prefers the public DSN, falls back to the private one", () => {
    expect(resolveSentryDsn({ NEXT_PUBLIC_SENTRY_DSN: "https://pub" })).toBe("https://pub");
    expect(resolveSentryDsn({ SENTRY_DSN: "https://priv" })).toBe("https://priv");
    expect(
      resolveSentryDsn({ NEXT_PUBLIC_SENTRY_DSN: "https://pub", SENTRY_DSN: "https://priv" }),
    ).toBe("https://pub");
  });
});

describe("resolveSentryEnvironment", () => {
  it("prefers explicit > Vercel > NODE_ENV", () => {
    expect(
      resolveSentryEnvironment({ SENTRY_ENVIRONMENT: "staging", VERCEL_ENV: "preview", NODE_ENV: "production" }),
    ).toBe("staging");
    expect(resolveSentryEnvironment({ VERCEL_ENV: "preview", NODE_ENV: "production" })).toBe("preview");
    expect(resolveSentryEnvironment({ NODE_ENV: "test" })).toBe("test");
    expect(resolveSentryEnvironment({})).toBe("development");
  });
});

describe("resolveTracesSampleRate", () => {
  it("defaults to 10% in production, full elsewhere", () => {
    expect(resolveTracesSampleRate({ NODE_ENV: "production" })).toBe(0.1);
    expect(resolveTracesSampleRate({ NODE_ENV: "development" })).toBe(1);
  });

  it("honours an explicit rate and clamps to 1", () => {
    expect(resolveTracesSampleRate({ SENTRY_TRACES_SAMPLE_RATE: "0.25" })).toBe(0.25);
    expect(resolveTracesSampleRate({ SENTRY_TRACES_SAMPLE_RATE: "5" })).toBe(1);
    expect(resolveTracesSampleRate({ SENTRY_TRACES_SAMPLE_RATE: "0" })).toBe(0);
  });

  it("falls back to the default for garbage input", () => {
    expect(resolveTracesSampleRate({ SENTRY_TRACES_SAMPLE_RATE: "abc", NODE_ENV: "production" })).toBe(0.1);
    expect(resolveTracesSampleRate({ SENTRY_TRACES_SAMPLE_RATE: "-1", NODE_ENV: "production" })).toBe(0.1);
  });
});

describe("stripUrlSecrets", () => {
  it("drops query strings and fragments", () => {
    expect(stripUrlSecrets("https://app.example.com/reports?token=abc&x=1#frag")).toBe(
      "https://app.example.com/reports",
    );
  });

  it("handles bare paths and undefined", () => {
    expect(stripUrlSecrets("/settings?tab=account")).toBe("/settings");
    expect(stripUrlSecrets(undefined)).toBeUndefined();
  });
});

describe("scrubEvent", () => {
  function event(): ErrorEvent {
    return {
      event_id: "e1",
      request: {
        method: "POST",
        url: "https://app.example.com/login?email=owner@example.com",
        headers: { cookie: "sb-access=secret", authorization: "Bearer abc" },
        data: { email: "owner@example.com", password: "hunter2" },
      },
      user: { id: "u-1", email: "owner@example.com" },
      extra: { password: "hunter2", rawBody: "…", tenantId: "biz-a", safe: "keep me" },
    } as unknown as ErrorEvent;
  }

  it("removes user identity entirely", () => {
    const scrubbed = scrubEvent(event());
    expect(scrubbed.user).toBeUndefined();
  });

  it("keeps only the method and a query-free URL (no headers, cookies or body)", () => {
    const scrubbed = scrubEvent(event());
    expect(scrubbed.request).toEqual({
      method: "POST",
      url: "https://app.example.com/login",
    });
    expect(JSON.stringify(scrubbed)).not.toContain("owner@example.com");
    expect(JSON.stringify(scrubbed)).not.toContain("hunter2");
    expect(JSON.stringify(scrubbed)).not.toContain("sb-access");
  });

  it("drops sensitive-looking extras but leaves harmless ones", () => {
    const scrubbed = scrubEvent(event());
    expect(scrubbed.extra).not.toHaveProperty("password");
    expect(scrubbed.extra).not.toHaveProperty("rawBody");
    expect(scrubbed.extra).toEqual({ tenantId: "biz-a", safe: "keep me" });
  });

  it("tolerates an event with no request/user/extra", () => {
    const minimal = { event_id: "e2" } as ErrorEvent;
    expect(() => scrubEvent(minimal)).not.toThrow();
    expect(minimal.user).toBeUndefined();
  });
});

describe("sentry option builders", () => {
  it("are disabled without a DSN", () => {
    expect(serverSentryOptions({}).enabled).toBe(false);
    expect(clientSentryOptions({}).enabled).toBe(false);
  });

  it("are enabled and never send default PII when a DSN is present", () => {
    const env = { NEXT_PUBLIC_SENTRY_DSN: "https://pub", NODE_ENV: "production" };
    for (const options of [serverSentryOptions(env), clientSentryOptions(env)]) {
      expect(options.enabled).toBe(true);
      expect(options.dsn).toBe("https://pub");
      expect(options.sendDefaultPii).toBe(false);
      expect(options.environment).toBe("production");
      expect(options.tracesSampleRate).toBe(0.1);
      expect(typeof options.beforeSend).toBe("function");
    }
  });
});
