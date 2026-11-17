import type { MetadataRoute } from "next";

/**
 * Web app manifest. Served at /manifest.webmanifest by Next's file-based
 * metadata. Colours stay in step with the brand and paper tokens.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LedgerAI",
    short_name: "LedgerAI",
    description:
      "Upload OPay, Kuda, GTBank or Moniepoint statements and keep a clean record of sales, transfers and expenses.",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f0e7",
    theme_color: "#1c4b36",
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
