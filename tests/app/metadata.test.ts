import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { config } from "@/proxy";
import manifest from "@/app/manifest";
import { viewport } from "@/app/layout";

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p));

/** Parse a PNG's pixel dimensions straight from its IHDR chunk. */
function pngSize(buf: Buffer): { width: number; height: number } {
  const isPng =
    buf[0] === 0x89 &&
    buf.subarray(1, 4).toString("latin1") === "PNG" &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a;
  if (!isPng) throw new Error("not a PNG");
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

describe("app icons (file-based metadata)", () => {
  it("ships a scalable SVG brand mark in the brand colour", () => {
    const svg = read("src/app/icon.svg").toString("utf8");
    expect(svg).toContain("<svg");
    expect(svg).toContain("#2563eb");
  });

  it("ships a favicon.ico containing 16, 32 and 48 px images", () => {
    const ico = read("src/app/favicon.ico");
    expect(ico.readUInt16LE(0)).toBe(0); // reserved
    expect(ico.readUInt16LE(2)).toBe(1); // type: icon
    expect(ico.readUInt16LE(4)).toBe(3); // image count
    const sizes = [0, 1, 2].map((i) => ico.readUInt8(6 + i * 16));
    expect(sizes).toEqual([16, 32, 48]);
  });

  it("ships an opaque 180x180 apple icon", () => {
    expect(pngSize(read("src/app/apple-icon.png"))).toEqual({ width: 180, height: 180 });
  });

  it("ships a 1200x630 opengraph image", () => {
    expect(pngSize(read("src/app/opengraph-image.png"))).toEqual({
      width: 1200,
      height: 630,
    });
  });

  it("ships 192/512 manifest icons (any + maskable)", () => {
    expect(pngSize(read("public/icon-192.png"))).toEqual({ width: 192, height: 192 });
    expect(pngSize(read("public/icon-512.png"))).toEqual({ width: 512, height: 512 });
    expect(pngSize(read("public/icon-maskable-192.png"))).toEqual({
      width: 192,
      height: 192,
    });
    expect(pngSize(read("public/icon-maskable-512.png"))).toEqual({
      width: 512,
      height: 512,
    });
  });
});

describe("web manifest", () => {
  it("names the app and pins the brand colours", () => {
    const m = manifest();
    expect(m.name).toBe("LedgerAI");
    expect(m.short_name).toBe("LedgerAI");
    expect(m.theme_color).toBe("#2563eb");
    expect(m.background_color).toBe("#ffffff");
  });

  it("declares 192 and 512 icons, including a maskable one", () => {
    const icons = manifest().icons ?? [];
    const sizes = icons.map((i) => i.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
    expect(icons.some((i) => i.purpose === "maskable")).toBe(true);
  });
});

describe("theme colour + CSP", () => {
  it("exposes the brand theme colour via the viewport export", () => {
    expect(viewport.themeColor).toBe("#2563eb");
  });

  it("lets the browser load same-origin icons and the manifest", () => {
    // The proxy applies the CSP in production. Icons are images and the
    // manifest is fetched under manifest-src; both must be 'self'.
    const src = read("src/proxy.ts").toString("utf8");
    expect(src).toContain("img-src 'self' data: blob:");
    expect(src).toContain("manifest-src 'self'");
  });

  it("excludes static metadata assets (incl. .webmanifest) from cookie gating", () => {
    const regex = new RegExp(config.matcher[0]);
    // Static metadata assets bypass the proxy entirely.
    expect(regex.test("/manifest.webmanifest")).toBe(false);
    expect(regex.test("/icon.svg")).toBe(false);
    expect(regex.test("/apple-icon.png")).toBe(false);
    expect(regex.test("/favicon.ico")).toBe(false);
    // Real app routes are still gated.
    expect(regex.test("/overview")).toBe(true);
  });
});
