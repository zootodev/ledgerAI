import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";

const headerMap = new Map<string, string>();

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => ({
    get: (key: string) => headerMap.get(key.toLowerCase()) ?? null,
  })),
}));

import { getAppBaseUrl } from "@/lib/auth/app-url";

const ORIGINAL_APP_URL = process.env.NEXT_PUBLIC_APP_URL;

beforeEach(() => {
  headerMap.clear();
});

afterEach(() => {
  if (ORIGINAL_APP_URL === undefined) {
    delete process.env.NEXT_PUBLIC_APP_URL;
  } else {
    process.env.NEXT_PUBLIC_APP_URL = ORIGINAL_APP_URL;
  }
});

describe("getAppBaseUrl", () => {
  it("uses NEXT_PUBLIC_APP_URL when set to a valid URL (production)", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com/";
    headerMap.set("host", "localhost:3000");
    await expect(getAppBaseUrl()).resolves.toBe("https://app.example.com");
  });

  it("ignores an empty NEXT_PUBLIC_APP_URL and derives from the request host", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "";
    headerMap.set("host", "172.20.10.2:3000");
    await expect(getAppBaseUrl()).resolves.toBe("http://172.20.10.2:3000");
  });

  it("derives the laptop's LAN address from the request host (mobile dev, no hardcoded IP)", async () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    headerMap.set("host", "172.20.10.2:3000");
    await expect(getAppBaseUrl()).resolves.toBe("http://172.20.10.2:3000");
  });

  it("keeps localhost when developing on the laptop itself", async () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    headerMap.set("host", "localhost:3000");
    await expect(getAppBaseUrl()).resolves.toBe("http://localhost:3000");
  });

  it("honors x-forwarded-host and x-forwarded-proto when present", async () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    headerMap.set("x-forwarded-proto", "https");
    headerMap.set("x-forwarded-host", "edge.example.com, localhost");
    await expect(getAppBaseUrl()).resolves.toBe("https://edge.example.com");
  });

  it("falls back to http for an empty x-forwarded-proto", async () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    headerMap.set("x-forwarded-proto", "");
    headerMap.set("host", "my.laptop.local:8080");
    await expect(getAppBaseUrl()).resolves.toBe("http://my.laptop.local:8080");
  });

  it("rejects a malformed host (host-header injection) and falls back", async () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    headerMap.set("host", "evil.com/path\nset-cookie:x=1");
    await expect(getAppBaseUrl()).resolves.toBe("http://localhost:3000");
  });

  it("rejects an invalid port", async () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    headerMap.set("host", "example.com:99999");
    await expect(getAppBaseUrl()).resolves.toBe("http://localhost:3000");
  });

  it("falls back to localhost when no headers are available", async () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    await expect(getAppBaseUrl()).resolves.toBe("http://localhost:3000");
  });
});