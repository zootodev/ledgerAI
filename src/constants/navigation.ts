import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  ArrowLeftRight,
  TrendingUp,
  TrendingDown,
  FileBarChart,
  Sparkles,
  MessageSquareText,
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
  { label: "Ask LedgerAI", href: "/ask-v2", icon: MessageSquareText, section: "analysis", badge: "Soon" },
  { label: "Import", href: "/import", icon: Upload, section: "manage" },
  { label: "Settings", href: "/settings", icon: Settings, section: "manage" },
];

/** Nav items grouped for display in the sidebar. */
export const NAV_SECTIONS: { title: string; items: NavItem[] }[] = [
  { title: "Main", items: NAV_ITEMS.filter((i) => i.section === "main") },
  { title: "Analysis", items: NAV_ITEMS.filter((i) => i.section === "analysis") },
  { title: "Manage", items: NAV_ITEMS.filter((i) => i.section === "manage") },
];
