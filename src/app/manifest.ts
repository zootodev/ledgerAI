import type { MetadataRoute } from "next";

/**
 * Web app manifest. Served at /manifest.webmanifest by Next's file-based
 * metadata. theme/background colours match the brand token
 * (`--brand: #2563eb`) and the solid surfaces used across the app.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LedgerAI",
    short_name: "LedgerAI",
    description:
      "Turn bank statements and transaction records into clear financial insights, reports, and smarter decisions.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#2563eb",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
