import * as React from "react";
import { cn } from "@/lib/utils/cn";

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Height in arbitrary units; defaults to a line of text. */
  height?: number | string;
}

export const Skeleton = React.forwardRef<HTMLDivElement, SkeletonProps>(
  function Skeleton({ className, height = 16, style, ...props }, ref) {
    return (
      <div
        ref={ref}
        className={cn(
          "animate-pulse rounded bg-surface-subtle",
          className,
        )}
        style={{ height, ...style }}
        aria-hidden="true"
        {...props}
      />
    );
  },
);
