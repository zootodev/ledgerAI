import * as React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";

type Variant =
  | "primary"
  | "secondary"
  | "outline"
  | "ghost"
  | "danger"
  | "dangerOutline"
  | "link";
type Size = "xs" | "sm" | "md" | "lg" | "icon";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
}

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-brand text-on-accent shadow-sm hover:bg-brand-hover active:bg-brand-strong disabled:opacity-50",
  secondary:
    "bg-surface-subtle text-foreground hover:bg-border/60 disabled:opacity-50",
  outline:
    "border border-border-strong bg-surface text-foreground hover:bg-surface-subtle disabled:opacity-50",
  ghost: "text-secondary hover:bg-surface-subtle hover:text-foreground disabled:opacity-50",
  danger: "bg-danger text-on-accent shadow-sm hover:bg-red-700 disabled:opacity-50",
  dangerOutline:
    "border border-danger/30 bg-surface text-danger hover:bg-danger-soft disabled:opacity-50",
  link: "text-brand underline-offset-4 hover:underline disabled:opacity-50",
};

const sizeClasses: Record<Size, string> = {
  xs: "h-7 px-2.5 text-xs gap-1.5",
  sm: "h-8 px-3 text-sm gap-1.5",
  md: "h-9.5 px-4 text-sm gap-2",
  lg: "h-11 px-5 text-base gap-2",
  icon: "h-9 w-9",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      className,
      variant = "primary",
      size = "md",
      loading = false,
      leftIcon,
      rightIcon,
      fullWidth = false,
      disabled,
      children,
      ...props
    },
    ref,
  ) {
    const isLink = variant === "link";
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center rounded-button font-medium",
          "transition-colors duration-150 select-none whitespace-nowrap",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40",
          "disabled:cursor-not-allowed",
          isLink && "px-0",
          variantClasses[variant],
          sizeClasses[size],
          fullWidth && "w-full",
          className,
        )}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          leftIcon
        )}
        {children}
        {!loading && rightIcon}
      </button>
    );
  },
);
