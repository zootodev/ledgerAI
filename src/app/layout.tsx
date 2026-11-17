import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/next";
import { Toaster } from "@/components/ui/toast";
import { siteUrl } from "@/lib/site";
import "./globals.css";

const bricolage = localFont({
  src: "./fonts/BricolageGrotesque-Variable.ttf",
  variable: "--font-bricolage",
  weight: "200 800",
  display: "swap",
});

// SG1-04: the proxy emits a request-scoped nonce CSP. Next only stamps inline
// scripts with the nonce when it renders the HTML per request, so every page
// must be server-rendered. A prerendered (static) page ships inline flight
// scripts without the nonce and they would be blocked by script-src.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: {
    default: "LedgerAI | Simple books for Nigerian small businesses",
    template: "%s | LedgerAI",
  },
  description:
    "Upload OPay, Kuda, GTBank or Moniepoint statements and keep a clean record of sales, transfers and expenses.",
  applicationName: "LedgerAI",
  openGraph: {
    type: "website",
    siteName: "LedgerAI",
    title: "LedgerAI | Simple books for Nigerian small businesses",
    description:
      "Upload OPay, Kuda, GTBank or Moniepoint statements and keep a clean record of sales, transfers and expenses.",
  },
  twitter: {
    card: "summary_large_image",
    title: "LedgerAI | Simple books for Nigerian small businesses",
    description:
      "Upload OPay, Kuda, GTBank or Moniepoint statements and keep a clean record of sales, transfers and expenses.",
  },
};

// Next.js reads themeColor from the viewport export. Keep it in step with the
// brand token so browser chrome matches the app.
export const viewport: Viewport = {
  themeColor: "#1c4b36",
  colorScheme: "light",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-NG" className={`${bricolage.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        {children}
        <Toaster />
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  );
}
