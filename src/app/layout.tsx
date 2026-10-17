import type { Metadata, Viewport } from "next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/next";
import { Toaster } from "@/components/ui/toast";
import { siteUrl } from "@/lib/site";
import "./globals.css";

// Fonts are the system stack (globals.css --font-sans/--font-mono). No
// network fetch at build or runtime, so fonts.googleapis.com is never hit.
// To self-host Geist later, drop the woff2 files in src/app/fonts and set
// the variables from next/font/local.

// SG1-04: the proxy emits a request-scoped nonce CSP. Next only stamps inline
// scripts with the nonce when it renders the HTML per request, so every page
// must be server-rendered — a prerendered (static) page ships inline flight
// scripts without the nonce and they would be blocked by script-src.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: {
    default: "LedgerAI — Financial Intelligence for Small Businesses",
    template: "%s | LedgerAI",
  },
  description:
    "Turn bank statements and transaction records into clear financial insights, reports, and smarter decisions.",
  applicationName: "LedgerAI",
  openGraph: {
    type: "website",
    siteName: "LedgerAI",
    title: "LedgerAI — Financial Intelligence for Small Businesses",
    description:
      "Turn bank statements and transaction records into clear financial insights, reports, and smarter decisions.",
  },
  twitter: {
    card: "summary_large_image",
    title: "LedgerAI — Financial Intelligence for Small Businesses",
    description:
      "Turn bank statements and transaction records into clear financial insights, reports, and smarter decisions.",
  },
};

// Next.js reads themeColor from the viewport export (metadata.themeColor is
// deprecated). Matches the brand token so the browser chrome/tab bar tints.
export const viewport: Viewport = {
  themeColor: "#2563eb",
  colorScheme: "light",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        {children}
        <Toaster />
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  );
}
