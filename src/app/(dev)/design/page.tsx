import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DesignShowcase } from "@/components/dev/design-showcase";

export const metadata: Metadata = {
  title: "Design System",
};

export default function DesignSystemPage() {
  // Internal design-system showcase. `/design` stays in the proxy PUBLIC_PATHS
  // list so it also works unauthenticated in local dev, but it must never be
  // reachable in a production deployment.
  if (process.env.NODE_ENV === "production") notFound();
  return <DesignShowcase />;
}
