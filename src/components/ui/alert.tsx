import * as React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  XCircle,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";

type Tone = "info" | "success" | "warning" | "danger";

export interface AlertProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  tone?: Tone;
  title?: React.ReactNode;
  children?: React.ReactNode;
  /** Renders a dismiss button and calls this when clicked. */
  onDismiss?: () => void;
}

const toneConfig: Record<
  Tone,
  { icon: React.ComponentType<{ className?: string }>; classes: string; iconClasses: string }
> = {
  info: {
    icon: Info,
    classes: "border-info/30 bg-info-soft",
    iconClasses: "text-info",
  },
  success: {
    icon: CheckCircle2,
    classes: "border-success/30 bg-success-soft",
    iconClasses: "text-success",
  },
  warning: {
    icon: AlertTriangle,
    classes: "border-warning/30 bg-warning-soft",
    iconClasses: "text-warning",
  },
  danger: {
    icon: XCircle,
    classes: "border-danger/30 bg-danger-soft",
    iconClasses: "text-danger",
  },
};

export function Alert({
  tone = "info",
  title,
  children,
  onDismiss,
  className,
  ...props
}: AlertProps) {
  const { icon: Icon, classes, iconClasses } = toneConfig[tone];
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-3 rounded-card border px-4 py-3 text-sm",
        classes,
        className,
      )}
      {...props}
    >
      <Icon className={cn("mt-0.5 h-4.5 w-4.5 shrink-0", iconClasses)} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        {title && <p className="font-medium text-foreground">{title}</p>}
        {children && <div className="mt-0.5 text-secondary">{children}</div>}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss alert"
          className="shrink-0 rounded p-0.5 text-subtle transition-colors hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
