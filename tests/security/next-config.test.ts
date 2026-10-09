import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

/** Every origin the production server-actions allowlist must NEVER contain. */
const CLAIMABLE_TUNNEL_ORIGINS = [
  "null",
  "ngrok",
  "trycloudflare",
  "loca.lt",
  "localhost.run",
  "serveo.net",
  "devtunnels.ms",
  "zooto.taile2c6a0.ts.net",
  "157.", // LAN IP ranges must not leak into production server-actions config
];

describe("next.config.ts — SG1-05 server-actions origins", () => {
  it("has no production server-actions origin allowlist at all", () => {
    const allowedOrigins = nextConfig.experimental?.serverActions?.allowedOrigins;
    expect(allowedOrigins).toBeUndefined();
  });

  it("keeps every claimable tunnel/origin out of the production config", () => {
    const experimental = JSON.stringify(nextConfig.experimental ?? {});
    for (const origin of CLAIMABLE_TUNNEL_ORIGINS) {
      expect(experimental, `experimental must not contain "${origin}"`).not.toContain(origin);
    }
  });

  it("keeps the explicit development-only allowedDevOrigins (dev tunnels still work)", () => {
    const devOrigins = nextConfig.allowedDevOrigins;
    expect(devOrigins).toBeDefined();
    expect(devOrigins?.some((o) => o.includes("ngrok"))).toBe(true);
    expect(devOrigins?.some((o) => o.includes("zooto.taile2c6a0.ts.net"))).toBe(true);
    // allowedDevOrigins is dev-only by design; keep the "null" note there, but
    // confirm nothing in the deployable server-actions path references it.
    const serialized = JSON.stringify(nextConfig);
    expect(serialized).not.toContain('"experimental.serverActions"');
  });
});

describe("next.config.ts — SG1-04 security headers", () => {
  it("declares the static security headers for every route", async () => {
    const headers = await (nextConfig.headers as () => Promise<unknown> | unknown)();
    const all = Array.isArray(headers) ? headers : [];
    const headerSet = all
      .flatMap((rule) => (rule as { headers?: { key: string; value: string }[] }).headers ?? [])
      .map((h) => [h.key.toLowerCase(), h.value]);

    expect(headerSet).toContainEqual(["x-content-type-options", "nosniff"]);
    expect(headerSet).toContainEqual(["referrer-policy", "strict-origin-when-cross-origin"]);
    expect(headerSet).toContainEqual(["x-frame-options", "DENY"]);
    expect(
      headerSet.some(([key, value]) => key === "permissions-policy" && value.includes("camera=()")),
    ).toBe(true);
    // HSTS is intentionally left to Vercel, never duplicated here.
    expect(headerSet.some(([key]) => key === "strict-transport-security")).toBe(false);
  });
});