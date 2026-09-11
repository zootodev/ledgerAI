import type { Metadata } from "next";
import { Toaster } from "@/components/ui/toast";
import "./globals.css";

// Fonts are the system stack (globals.css --font-sans/--font-mono). No
// network fetch at build or runtime, so fonts.googleapis.com is never hit.
// To self-host Geist later, drop the woff2 files in src/app/fonts and set
// the variables from next/font/local.

export const metadata: Metadata = {
  title: {
    default: "LedgerAI — Financial Intelligence for Small Businesses",
    template: "%s | LedgerAI",
  },
  description:
    "Turn bank statements and transaction records into clear financial insights, reports, and smarter decisions.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
