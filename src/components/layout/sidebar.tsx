"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_SECTIONS } from "@/constants/navigation";
import { cn } from "@/lib/utils/cn";

export interface SidebarProps extends React.HTMLAttributes<HTMLElement> {
  onNavigate?: () => void;
}

function SidebarNavLink({
  href,
  label,
  icon: Icon,
  active,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex items-center gap-2.5 rounded-field px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-brand-soft text-brand-strong"
          : "text-secondary hover:bg-surface-subtle hover:text-foreground",
      )}
    >
      <Icon
        className={cn("h-4.5 w-4.5", active ? "text-brand" : "text-subtle group-hover:text-secondary")}
        aria-hidden="true"
      />
      {label}
    </Link>
  );
}

export function Sidebar({ onNavigate, className }: SidebarProps) {
  const pathname = usePathname();

  return (
    <nav aria-label="Main" className={cn("flex h-full flex-col gap-6 px-3 py-5", className)}>
      {NAV_SECTIONS.map((section) => (
        <div key={section.title} className="flex flex-col">
          {section.items.length > 0 && (
            <p className="px-3 pb-1.5 text-xs font-medium uppercase tracking-wide text-subtle">
              {section.title}
            </p>
          )}
          <div className="flex flex-col gap-0.5">
            {section.items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <SidebarNavLink
                  key={item.href}
                  href={item.href}
                  label={item.label}
                  icon={item.icon}
                  active={active}
                  onNavigate={onNavigate}
                />
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
