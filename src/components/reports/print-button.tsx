"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Opens the browser print dialog — used to save a report as PDF. */
export function PrintButton() {
  return (
    <Button
      variant="outline"
      onClick={() => window.print()}
      leftIcon={<Printer className="h-4 w-4" aria-hidden="true" />}
    >
      Print / PDF
    </Button>
  );
}
