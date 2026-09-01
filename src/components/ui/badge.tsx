import * as React from "react";
import { cn } from "@/lib/utils/cn";

type Tone = "default" | "brand" | "success" | "warning" | "danger" | "info";
type Variant = "soft" | "solid" | "outline";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  variant?: Variant;
}

const toneClasses: Record<Tone, Record<Variant, string>> = {
  default: {
    soft: "bg-surface-subtle text-secondary",
    solid: "bg-secondary text-on-accent",
    outline: "border border-border-strong text-secondary",
  },
  brand: {
    soft: "bg-brand-soft text-brand-strong",
    solid: "bg-brand text-on-accent",
    outline: "border border-brand/30 text-brand-strong",
  },
  success: {
    soft: "bg-success-soft text-success",
    solid: "bg-success text-on-accent",
    outline: "border border-success/30 text-success",
  },
  warning: {
    soft: "bg-warning-soft text-warning",
    solid: "bg-warning text-on-accent",
    outline: "border border-warning/30 text-warning",
  },
  danger: {
    soft: "bg-danger-soft text-danger",
    solid: "bg-danger text-on-accent",
    outline: "border border-danger/30 text-danger",
  },
  info: {
    soft: "bg-info-soft text-info",
    solid: "bg-info text-on-accent",
    outline: "border border-info/30 text-info",
  },
};

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  function Badge({ className, tone = "default", variant = "soft", ...props }, ref) {
    return (
      <span
        ref={ref}
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
          "whitespace-nowrap",
          toneClasses[tone][variant],
          className,
        )}
        {...props}
      />
    );
  },
);
