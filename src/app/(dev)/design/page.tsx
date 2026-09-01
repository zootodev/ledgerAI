import type { Metadata } from "next";
import { DesignShowcase } from "@/components/dev/design-showcase";

export const metadata: Metadata = {
  title: "Design System",
};

export default function DesignSystemPage() {
  return <DesignShowcase />;
}
