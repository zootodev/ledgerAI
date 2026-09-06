"use client";

import * as React from "react";
import { Check, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export interface WizardStep {
  id: number;
  label: string;
}

/**
 * Lightweight inline stepper (the design system has no Stepper primitive).
 * Renders numbered steps with a connector and marks completed steps.
 */
export function WizardStepper({
  steps,
  current,
}: {
  steps: WizardStep[];
  current: number;
}) {
  return (
    <ol
      aria-label="Import progress"
      className="flex flex-wrap items-center gap-2"
    >
      {steps.map((step, index) => {
        const done = step.id < current;
        const active = step.id === current;
        return (
          <li key={step.id} className="flex items-center gap-2">
            {index > 0 && (
              <ChevronRight
                className="h-4 w-4 text-subtle"
                aria-hidden="true"
              />
            )}
            <span
              aria-current={active ? "step" : undefined}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
                active && "bg-brand text-on-accent",
                done && "bg-success-soft text-success",
                !active && !done && "bg-surface-subtle text-muted",
              )}
            >
              {done ? (
                <Check className="h-3 w-3" aria-hidden="true" />
              ) : (
                <span
                  className={cn(
                    "flex h-4 w-4 items-center justify-center rounded-full text-[10px]",
                    active ? "bg-white/20" : "bg-surface",
                  )}
                >
                  {step.id}
                </span>
              )}
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}