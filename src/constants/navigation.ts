import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  ArrowLeftRight,
  TrendingUp,
  TrendingDown,
  FileBarChart,
  Sparkles,
  Upload,
  Settings,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  section?: "main" | "analysis" | "manage";
  /** Optional short status tag rendered beside the label (e.g. "Soon"). */
  badge?: string;
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Overview", href: "/overview", icon: LayoutDashboard, section: "main" },
  { label: "Transactions", href: "/transactions", icon: ArrowLeftRight, section: "main" },
  { label: "Income", href: "/income", icon: TrendingUp, section: "main" },
  { label: "Expenses", href: "/expenses", icon: TrendingDown, section: "main" },
  { label: "Reports", href: "/reports", icon: FileBarChart, section: "analysis" },
  { label: "AI Insights", href: "/insights", icon: Sparkles, section: "analysis" },
  // Phase 5: the Ask feature is intentionally absent from navigation while it
  // is incomplete. The /ask and /ask-v2 routes exist but redirect; do not
  // re-add a nav item until Ask ships as a finished product surface.
  { label: "Import", href: "/import", icon: Upload, section: "manage" },
  { label: "Settings", href: "/settings", icon: Settings, section: "manage" },
];

/** Nav items grouped for display in the sidebar. */
export const NAV_SECTIONS: { title: string; items: NavItem[] }[] = [
  { title: "Main", items: NAV_ITEMS.filter((i) => i.section === "main") },
  { title: "Analysis", items: NAV_ITEMS.filter((i) => i.section === "analysis") },
  { title: "Manage", items: NAV_ITEMS.filter((i) => i.section === "manage") },
];
