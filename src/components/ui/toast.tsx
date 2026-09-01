"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { dismissToast, useToast, type ToastTone } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils/cn";

const toneConfig: Record<
  ToastTone,
  { icon: React.ComponentType<{ className?: string }>; ring: string; iconClasses: string }
> = {
  info: { icon: Info, ring: "border-info/30", iconClasses: "text-info" },
  success: { icon: CheckCircle2, ring: "border-success/30", iconClasses: "text-success" },
  warning: { icon: AlertTriangle, ring: "border-warning/30", iconClasses: "text-warning" },
  danger: { icon: XCircle, ring: "border-danger/30", iconClasses: "text-danger" },
};

/** Renders active toasts in a fixed stack. Mount once near the app root. */
export function Toaster() {
  const { toasts } = useToast();
  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed inset-x-4 top-4 z-[60] flex flex-col items-center gap-2 sm:items-end sm:inset-x-auto sm:right-4"
    >
      {toasts.map((toast) => {
        const { icon: Icon, ring, iconClasses } = toneConfig[toast.tone];
        return (
          <div
            key={toast.id}
            role={toast.tone === "danger" ? "alert" : "status"}
            className={cn(
              "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-card border bg-surface px-4 py-3 shadow-popover",
              ring,
            )}
          >
            <Icon className={cn("mt-0.5 h-4.5 w-4.5 shrink-0", iconClasses)} aria-hidden="true" />
            <div className="min-w-0 flex-1">
              {toast.title && <p className="text-sm font-medium text-foreground">{toast.title}</p>}
              {toast.description && (
                <div className="mt-0.5 text-sm text-secondary">{toast.description}</div>
              )}
            </div>
            <button
              type="button"
              onClick={() => dismissToast(toast.id)}
              aria-label="Dismiss notification"
              className="shrink-0 rounded p-0.5 text-subtle transition-colors hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
