"use client";

import * as React from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export interface WizardStep {
  id: number;
  label: string;
}

/**
 * Inline import progress. Numbered text rather than pills, so the file task
 * stays the loudest thing on the screen.
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
      className="flex items-center gap-1 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:flex-wrap sm:gap-2 sm:overflow-visible sm:pb-0"
    >
      {steps.map((step, index) => {
        const done = step.id < current;
        const active = step.id === current;
        return (
          <li key={step.id} className="flex shrink-0 items-center gap-1 sm:gap-2">
            {index > 0 && (
              <ChevronRight
                className="h-3.5 w-3.5 text-subtle"
                aria-hidden="true"
              />
            )}
            <span
              aria-current={active ? "step" : undefined}
              className={cn(
                "inline-flex items-center gap-1.5 text-xs",
                active && "font-semibold text-foreground",
                done && "text-muted",
                !active && !done && "text-subtle",
              )}
            >
              <span className="tabular-nums">{step.id}.</span>
              <span className={active ? "inline" : "hidden sm:inline"}>
                {step.label}
              </span>
              {!active && <span className="sr-only sm:hidden">{step.label}</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
