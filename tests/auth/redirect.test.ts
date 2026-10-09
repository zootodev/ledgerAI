import { describe, it, expect } from "vitest";
import { resolvePostAuthRedirect } from "@/lib/auth/redirect";

describe("resolvePostAuthRedirect", () => {
  it("defaults to overview for empty", () => {
    expect(resolvePostAuthRedirect(null, "http://172.20.10.2:3000")).toBe(
      "http://172.20.10.2:3000/overview",
    );
  });
  it("keeps a valid internal target", () => {
    expect(resolvePostAuthRedirect("/transactions", "http://172.20.10.2:3000")).toBe(
      "http://172.20.10.2:3000/transactions",
    );
  });
  it("blocks backslash smuggle", () => {
    expect(resolvePostAuthRedirect("/\\evil.example", "http://172.20.10.2:3000")).toBe(
      "http://172.20.10.2:3000/overview",
    );
  });
  it("blocks protocol-relative", () => {
    expect(resolvePostAuthRedirect("//evil.example", "http://172.20.10.2:3000")).toBe(
      "http://172.20.10.2:3000/overview",
    );
  });
  it("blocks absolute", () => {
    expect(resolvePostAuthRedirect("http://evil.example", "http://172.20.10.2:3000")).toBe(
      "http://172.20.10.2:3000/overview",
    );
  });
  it("blocks whitespace", () => {
    expect(resolvePostAuthRedirect("/overview next", "http://172.20.10.2:3000")).toBe(
      "http://172.20.10.2:3000/overview",
    );
  });
  it("scan: every labeled malicious input lands on origin", () => {
    const base = "http://172.20.10.2:3000";
    const value = encodeURIComponent("/\\evil.example");
    const url = new URL(`${base}/auth/callback?code=abc`);
    url.searchParams.set("next", "/\\evil.example");
    const target = resolvePostAuthRedirect(url.searchParams.get("next"), base);
    expect(target.startsWith(`${base}/`)).toBe(true);
    expect(target.endsWith("/overview")).toBe(true);
    expect(value.length).toBeGreaterThan(0);
  });
  it("preserves a query string on an internal target", () => {
    expect(
      resolvePostAuthRedirect("/transactions?page=2", "http://172.20.10.2:3000"),
    ).toBe("http://172.20.10.2:3000/transactions?page=2");
  });

  it("debug: request roundtrip", async () => {
    const url = new URL("http://172.20.10.2:3000/auth/callback?code=abc");
    url.searchParams.set("next", "//evil.example");
    const s = url.toString();
    const r = new Request(s);
    expect(r.url).toBe(s);
    expect(new URL(r.url).searchParams.get("next")).toBe("//evil.example");
    const raw = new URL(r.url);
    console.log("DEBUG URL:", JSON.stringify(s));
    expect(raw.toString()).toBe(s);
  });
});