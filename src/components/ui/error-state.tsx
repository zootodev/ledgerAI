import * as React from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

export interface ErrorStateProps {
  title?: string;
  description?: React.ReactNode;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({
  title = "This page did not load",
  description = "The server did not send the data. Try again. If it keeps failing, sign out and back in.",
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        "rounded-card border border-danger/30 bg-danger-soft px-5 py-6",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <AlertTriangle
          className="mt-0.5 h-4 w-4 shrink-0 text-danger"
          aria-hidden="true"
        />
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold text-foreground">{title}</h3>
          <p className="mt-1 max-w-xl text-sm leading-6 text-secondary">{description}</p>
          {onRetry && (
            <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
              Try again
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
